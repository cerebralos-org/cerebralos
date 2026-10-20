// src/dispatch/colab-video.js — colab_video 担当: MiniMax H3 を Google Colab の GPU で動かして mp4 を作る
//
// VM 側の本体は src/dispatch/colab/h3_generate.py（ComfyUI + MiniMax H3。mp4 と同名の .json を出す）。
// ここは batch_b.sh（実運用で動いた版）相当の制御を Node で行う:
//   colab usage（前）→ colab new（H100 を 1 回 → だめなら A100。どちらも --high-mem）→ upload → 短い exec で Popen 起動
//   → 出力 JSON の有無でポーリング → mp4 に AI 生成のメタデータを付ける → download → colab stop（必ず）→ colab usage（後）
// 実地で分かった注意（2026-10 やなぎ）:
//   ① colab exec の起動確認が通信切れで取りこぼすことがある（実際は起動済みのことがある）
//      → 再試行の前に VM 上で h3_generate が動いていないか（pgrep）と進捗ファイルの有無を確認し、二重起動を防ぐ
//   ② 生成後も子プロセスがゾンビで「生存」に見える → 完了判定は出力 JSON の有無だけで行う（生存確認は使わない）
//   ③ H100 は拒否されることが多い → H100 を 1 回試し、だめなら A100（--high-mem）
//   ④ 毎回 colab stop を必ず（finally。作成を試みたセッションはすべて止める）
//   ⑤ 重みの DL と ComfyUI の clone の衝突は h3_generate.py 側で修正済み
// AI 生成の明示（MiniMax H3 Community License Exhibit A 12 項）: mp4 の comment / description に "AI-generated with MiniMax H3" を入れ、
//   結果文にも「公開時は AI 生成である旨を明記」と書く。
// colab コマンドは ~/.local/bin/colab（findBin）。環境変数は childEnv（API キー・hub トークンを渡さない）。
import fs from 'fs';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { childEnv, findBin } from './exec.js';
import { parseVideoTask, STYLE_HINT } from './gen-task.js';
import { formatBalanceLines } from './balance.js';

export const H3_SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'colab', 'h3_generate.py');
export const AI_TAG = 'AI-generated with MiniMax H3';
export const DISCLOSURE = '公開時は AI 生成である旨を明記してください（MiniMax H3 Community License Exhibit A 12 項）。';
export const GPU_PLAN = ['H100', 'A100'];
export const REMOTE_DIR = '/content/h3_out';
const REMOTE_SCRIPT = '/content/h3_generate.py';

// ---------- colab CLI の実行（テストでは差し替え）----------
// 戻り値 { code, stdout, stderr, timedOut }
export function makeColabRunner(bin = findBin('colab')) {
  return (args, { input = null, timeoutMs = 120000, signal } = {}) => new Promise((resolve) => {
    if (!bin) { resolve({ code: -1, stdout: '', stderr: 'colab CLI が見つかりません', timedOut: false }); return; }
    let out = '', err = '', done = false, timedOut = false;
    const child = spawn(bin, args, { env: childEnv(), stdio: ['pipe', 'pipe', 'pipe'], detached: true });
    const kill = () => { try { process.kill(-child.pid, 'SIGTERM'); } catch { try { child.kill('SIGTERM'); } catch { /* 終了済み */ } } };
    const timer = setTimeout(() => { timedOut = true; kill(); }, timeoutMs);
    const onAbort = () => kill();
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
    child.stdout.on('data', (d) => { if (out.length < 1_000_000) out += d; });
    child.stderr.on('data', (d) => { if (err.length < 1_000_000) err += d; });
    const fin = (code) => { if (done) return; done = true; clearTimeout(timer); if (signal) signal.removeEventListener('abort', onAbort); resolve({ code, stdout: out, stderr: err, timedOut }); };
    child.on('error', (e) => { err += String(e.message); fin(-1); });
    child.on('close', (code) => fin(code));
    try { child.stdin.end(input == null ? '' : input); } catch { /* ok */ }
  });
}

// `colab usage` の出力: "Current balance: 87.50 compute units" → 87.5（読めなければ null）
export function parseUsage(stdout) {
  const m = String(stdout || '').match(/Current balance:\s*(-?[\d.]+)/i);
  return m ? Number(m[1]) : null;
}

export async function colabBalance(colab, { signal } = {}) {
  const r = await colab(['usage'], { timeoutMs: 60000, signal });
  const b = r.code === 0 ? parseUsage(r.stdout) : null;
  return { ok: b != null, balance: b, error: b == null ? (r.stderr || r.stdout || `exit ${r.code}`).replace(/\s+/g, ' ').trim().slice(0, 200) : '' };
}

// ---------- VM 上で動かす Python（純粋に文字列を作る）----------
const pyStr = (s) => JSON.stringify(String(s)); // JSON の文字列リテラルは Python の文字列リテラルとしても正しい

export function h3Argv(task, remoteOut) {
  const a = ['--prompt', task.prompt, '--seconds', String(task.seconds), '--size', task.size, '--out', remoteOut];
  if (task.turbo) a.push('--turbo'); else a.push('--steps', String(task.steps || 20));
  if (task.seed != null) a.push('--seed', String(task.seed));
  return a;
}

export function launcherCode(argv, { remoteDir = REMOTE_DIR } = {}) {
  return `import json, os, subprocess, sys
os.makedirs(${pyStr(remoteDir)}, exist_ok=True)
argv = json.loads(${pyStr(JSON.stringify(argv))})
log = open(${pyStr(`${remoteDir}/run.log`)}, "w")
p = subprocess.Popen([sys.executable, "-u", ${pyStr(REMOTE_SCRIPT)}, *argv], stdout=log, stderr=subprocess.STDOUT, cwd="/content", start_new_session=True)
open(${pyStr(`${remoteDir}/pid`)}, "w").write(str(p.pid))
print("H3_LAUNCHED pid", p.pid)
`;
}

// 起動済みか（① 二重起動防止）: h3_generate のプロセス・進捗ファイル・出力 JSON のどれかがあれば起動済み
export function probeCode(remoteOut, remoteJson) {
  return `import os, subprocess
r = subprocess.run(["pgrep", "-f", "h3_generate.py"], capture_output=True, text=True)
pids = [x for x in r.stdout.split() if x.strip().isdigit() and int(x) != os.getpid()]
print("H3PROBE running=%d status=%d json=%d" % (1 if pids else 0, 1 if os.path.exists(${pyStr(`${remoteOut}.status.json`)}) else 0, 1 if os.path.exists(${pyStr(remoteJson)}) else 0))
`;
}

// ② 完了判定は JSON の有無だけ（プロセスの生存は見ない）
export function pollCode(remoteOut, remoteJson) {
  return `import json, os
if os.path.exists(${pyStr(remoteJson)}):
    try:
        j = json.load(open(${pyStr(remoteJson)}))
    except Exception as e:
        j = {"ok": False, "error": "json unreadable: %s" % e}
    print("H3DONE " + json.dumps({"ok": bool(j.get("ok")), "exit_code": j.get("exit_code"), "error": str(j.get("error") or "")[:300], "duration": j.get("duration_s_nominal"), "seed": j.get("seed"), "width": j.get("width"), "height": j.get("height"), "steps": j.get("steps")}))
else:
    st = {}
    try:
        st = json.load(open(${pyStr(`${remoteOut}.status.json`)}))
    except Exception:
        pass
    print("H3WAIT state=%s phase=%s" % (st.get("state", "starting"), st.get("phase", "-")))
`;
}

export function tagCode(remoteOut, tag = AI_TAG) {
  return `import os, subprocess
src = ${pyStr(remoteOut)}
tmp = src[:-4] + ".tagged.mp4"
r = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-map", "0", "-c", "copy", "-metadata", "comment=" + ${pyStr(tag)}, "-metadata", "description=" + ${pyStr(tag)}, tmp], capture_output=True, text=True)
ok = r.returncode == 0 and os.path.exists(tmp) and os.path.getsize(tmp) > 0
if ok:
    os.replace(tmp, src)
print("H3TAG ok=%d" % (1 if ok else 0))
`;
}

export function parseProbe(stdout) {
  const m = String(stdout || '').match(/H3PROBE running=(\d) status=(\d) json=(\d)/);
  if (!m) return null;
  return { running: m[1] === '1', status: m[2] === '1', json: m[3] === '1', launched: m[1] === '1' || m[2] === '1' || m[3] === '1' };
}

export function parsePoll(stdout) {
  const s = String(stdout || '');
  const d = s.match(/H3DONE (\{.*\})/);
  if (d) { try { return { done: true, ...JSON.parse(d[1]) }; } catch { return { done: true, ok: false, error: 'JSON を読めませんでした' }; } }
  const w = s.match(/H3WAIT state=(\S+) phase=(\S+)/);
  return w ? { done: false, state: w[1], phase: w[2] } : null;
}

const sleepDefault = (ms, signal) => new Promise((r) => { const t = setTimeout(r, ms); if (signal) signal.addEventListener('abort', () => { clearTimeout(t); r(); }, { once: true }); });

// ---------- 生成の制御（batch_b.sh 相当）----------
// 戻り値 { ok, gpu, sessions:[...], info?, error?, localMp4?, tagged }
export async function generateOnColab({ task, colab, localMp4, session, timeoutMs, pollMs = 30000, sleep = sleepDefault, signal, log = () => {}, now = () => Date.now(), localFfmpeg = null, script = H3_SCRIPT }) {
  const deadline = now() + timeoutMs;
  const tried = [];
  const res = { ok: false, gpu: null, sessions: tried, tagged: false };
  const remoteOut = `${REMOTE_DIR}/${session}.mp4`;
  const remoteJson = `${REMOTE_DIR}/${session}.json`;
  const left = () => Math.max(0, deadline - now());
  try {
    // ③ H100 → A100
    let s = null;
    for (const gpu of GPU_PLAN) {
      const name = gpu === GPU_PLAN[0] ? session : `${session}-${gpu.toLowerCase()}`;
      tried.push(name); // 作成に失敗しても半端なセッションが残りうるので、試したものは全部止める
      log(`colab new -s ${name} --gpu ${gpu} --high-mem`);
      const r = await colab(['new', '-s', name, '--gpu', gpu, '--high-mem'], { timeoutMs: Math.min(15 * 60000, left()), signal });
      if (r.code === 0) { s = name; res.gpu = gpu; break; }
      log(`colab new (${gpu}) 失敗: ${(r.stderr || r.stdout).replace(/\s+/g, ' ').slice(-200)}`);
      if (signal && signal.aborted) throw new Error('中断');
    }
    if (!s) throw new Error(`GPU を確保できませんでした（${GPU_PLAN.join(' → ')} とも拒否）`);

    const up = await colab(['upload', '-s', s, script, REMOTE_SCRIPT], { timeoutMs: 5 * 60000, signal });
    if (up.code !== 0) throw new Error(`h3_generate.py のアップロードに失敗: ${(up.stderr || up.stdout).replace(/\s+/g, ' ').slice(-200)}`);

    // 起動（①: 確認を取りこぼしたら、再試行の前に VM 上で起動済みかを確かめる）
    const launcher = launcherCode(h3Argv(task, remoteOut));
    let launched = false;
    for (let attempt = 0; attempt < 2 && !launched; attempt++) {
      if (attempt > 0) {
        for (let i = 0; i < 3 && !launched; i++) {
          const pr = parseProbe((await colab(['exec', '-s', s, '--timeout', '60'], { input: probeCode(remoteOut, remoteJson), timeoutMs: 120000, signal })).stdout);
          if (pr && pr.launched) { launched = true; log('起動確認を取りこぼしたが VM 上では起動済み（二重起動しない）'); break; }
          if (pr) break; // 確認できた上で未起動 → 起動し直す
          await sleep(10000, signal);
        }
        if (launched) break;
      }
      const r = await colab(['exec', '-s', s, '--timeout', '120'], { input: launcher, timeoutMs: 180000, signal });
      if (/H3_LAUNCHED/.test(r.stdout || '')) { launched = true; break; }
      log(`起動確認が取れません（${attempt + 1} 回目）: ${(r.stderr || r.stdout).replace(/\s+/g, ' ').slice(-160)}`);
      if (attempt === 1) {
        // 最後にもう一度だけ確認（2 回目の起動も確認を取りこぼした場合）
        const pr = parseProbe((await colab(['exec', '-s', s, '--timeout', '60'], { input: probeCode(remoteOut, remoteJson), timeoutMs: 120000, signal })).stdout);
        if (pr && pr.launched) launched = true;
      }
    }
    if (!launched) throw new Error('VM 上で生成を起動できませんでした');

    // ポーリング（② JSON の有無で完了判定）
    let info = null, fails = 0;
    while (!info) {
      if (signal && signal.aborted) throw new Error('中断');
      if (left() <= 0) throw new Error(`上限時間（${Math.round(timeoutMs / 60000)} 分）を超えたため打ち切りました`);
      await sleep(Math.min(pollMs, left()), signal);
      const r = await colab(['exec', '-s', s, '--timeout', '60'], { input: pollCode(remoteOut, remoteJson), timeoutMs: 120000, signal });
      const p = r.code === 0 ? parsePoll(r.stdout) : null;
      if (!p) { if (++fails >= 5) throw new Error('VM との通信が 5 回続けて失敗しました'); continue; }
      fails = 0;
      if (p.done) info = p;
      else log(`生成中: ${p.state} / ${p.phase}`);
    }
    res.info = info;
    if (!info.ok) throw new Error(`生成に失敗しました（終了コード ${info.exit_code ?? '?'}）${info.error ? `: ${info.error}` : ''}`);

    // AI 生成のメタデータ（VM の ffmpeg で付ける。だめならローカルの ffmpeg）
    const tg = await colab(['exec', '-s', s, '--timeout', '120'], { input: tagCode(remoteOut), timeoutMs: 180000, signal });
    res.tagged = /H3TAG ok=1/.test(tg.stdout || '');
    const dl = await colab(['download', '-s', s, remoteOut, localMp4], { timeoutMs: 15 * 60000, signal });
    if (dl.code !== 0 || !fs.existsSync(localMp4)) throw new Error(`mp4 のダウンロードに失敗: ${(dl.stderr || dl.stdout).replace(/\s+/g, ' ').slice(-200)}`);
    if (!res.tagged && localFfmpeg) res.tagged = tagLocal(localFfmpeg, localMp4);
    res.ok = true;
    res.localMp4 = localMp4;
    return res;
  } catch (e) {
    res.error = e.message;
    return res;
  } finally {
    // ④ 必ず止める（中断・失敗・成功のどれでも）
    for (const name of tried) {
      const r = await colab(['stop', '-s', name], { timeoutMs: 120000 }).catch(() => ({ code: -1 }));
      if (r.code !== 0) log(`colab stop -s ${name} が失敗（存在しない場合も含む）`);
    }
  }
}

export function tagLocal(ffmpeg, mp4) {
  const tmp = mp4.replace(/\.mp4$/, '.tagged.mp4');
  const r = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', mp4, '-map', '0', '-c', 'copy', '-metadata', `comment=${AI_TAG}`, '-metadata', `description=${AI_TAG}`, tmp], { timeout: 120000, env: childEnv() });
  if (r.status === 0 && fs.existsSync(tmp) && fs.statSync(tmp).size > 0) { fs.renameSync(tmp, mp4); return true; }
  try { fs.unlinkSync(tmp); } catch { /* 無し */ }
  return false;
}

// ---------- 作業中の札（Colab の VM を二重に借りない）----------
// Colab を使う実行は、実行前に hub の札 colab:<種類> を取る。取れなければ実行せずに deferred（承認済みのまま少し後に再試行。needs_attention にしない）。
// 2026-10-14: 別の Claude セッションが同じ Colab レンダリングを同時に始め、VM が二重に借りられた事故への対策。
// 手動の Colab 作業も同じ key を使えば、dispatch と手動のどちらかだけが動く（`cerebralos lock acquire colab:video`）。
export const colabLockKey = (kind) => `colab:${String(kind || 'job').toLowerCase().replace(/[^a-z0-9_.-]+/g, '-').slice(0, 60) || 'job'}`;
export const COLAB_VIDEO_LOCK = colabLockKey('video');

// lock: makeHubLock（src/live-client.js）か同じ形のもの。null なら札なしで実行（テスト・旧来）
// 戻り値: { ok: true, release() } | { ok: false, deferred: { status:'deferred', result, retry_after, files:[] } }
export async function acquireColabLock(lock, { kind, ttlMin, note, log = () => {}, now = Date.now() } = {}) {
  const key = colabLockKey(kind);
  if (!lock) return { ok: true, key, release: async () => {} };
  const r = await lock.acquire(key, { ttlMin, note });
  if (r.ok) {
    if (!r.skipped) log(`札を取得: ${key}`);
    return { ok: true, key, release: async () => { if (!r.skipped) { await lock.release(key); log(`札を解放: ${key}`); } } };
  }
  const h = r.holder || {};
  const exp = Date.parse(h.expires_at);
  // 再試行は札の期限まで（1〜30 分に丸める。hub 側でも丸める）
  const retry = new Date(Math.min(now + 30 * 60000, Math.max(now + 60000, Number.isFinite(exp) ? exp : now + 5 * 60000))).toISOString();
  const who = `${h.holder_agent || '?'}${h.machine ? `@${h.machine}` : ''}${h.note ? `「${String(h.note).slice(0, 80)}」` : ''}`;
  log(`札 ${key} は ${who} が使用中のため待ちます（${retry} 以降に再試行）`);
  return { ok: false, key, deferred: { status: 'deferred', result: `実行していません: ${key} を ${who} が使用中です（〜${Number.isFinite(exp) ? new Date(exp).toISOString() : '?'}）。空いたら自動で再試行します。`, retry_after: retry, files: [] } };
}

const stamp = (ms) => new Date(ms + 9 * 3600000).toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');

// 1 カードの実行。戻り値 { status, result, files }
export async function runColabVideo({ card, cfg, workDir, where = '', signal, colab = makeColabRunner(), log = () => {}, now = Date.now(), sleep, pollMs, localFfmpeg = findBin('ffmpeg'), lock = null }) {
  const task = parseVideoTask(card.text);
  if (task.error) return { status: 'needs_attention', result: `実行していません: ${task.error}`, files: [] };
  if (!fs.existsSync(H3_SCRIPT)) return { status: 'failed', result: `VM 用スクリプトがありません: ${H3_SCRIPT}`, files: [] };
  // 札の期限は実行の上限 + 20 分（落ちても期限で自然に空く）
  const held = await acquireColabLock(lock, { kind: 'video', ttlMin: Math.min(360, (cfg.colabVideoTimeoutMin || 40) + 20), note: `dispatch ${card.id}`, log, now });
  if (!held.ok) return held.deferred;
  try {
    return await runColabVideoLocked({ card, cfg, workDir, where, signal, colab, log, now, sleep, pollMs, localFfmpeg, task });
  } finally {
    await held.release().catch(() => {});
  }
}

async function runColabVideoLocked({ card, cfg, workDir, where, signal, colab, log, now, sleep, pollMs, localFfmpeg, task }) {
  const before = await colabBalance(colab, { signal });
  if (!before.ok) return { status: 'failed', result: `colab usage が通りません（未認証・CLI 未導入の可能性）。実行していません: ${before.error}`, files: [] };
  fs.mkdirSync(path.join(workDir, 'out'), { recursive: true });
  const name = `video-${stamp(now)}.mp4`;
  const localMp4 = path.join(workDir, 'out', name);
  const session = `cl-${String(card.id).replace(/^b-/, '').replace(/[^A-Za-z0-9]/g, '').slice(0, 8)}-${stamp(now).replace('-', '')}`;
  const timeoutMs = (cfg.colabVideoTimeoutMin || 40) * 60000;
  log(`colab_video: ${task.seconds} 秒 ${task.size} ${task.turbo ? '高速(turbo 8 steps)' : `高画質(${task.steps} steps)`} 上限 ${cfg.colabVideoTimeoutMin || 40} 分`);
  const g = await generateOnColab({ task, colab, localMp4, session, timeoutMs, signal, log, sleep, pollMs, localFfmpeg });
  const after = await colabBalance(colab).catch(() => ({ ok: false }));
  const spent = after.ok ? Math.max(0, before.balance - after.balance) : null;
  const remain = { colab: { balance: after.ok ? after.balance : before.balance, monthly: cfg.colabUnitsMonthly || 100 } };
  const seconds = g.info && Number(g.info.duration) > 0 ? Number(g.info.duration) : task.seconds;
  const files = g.ok ? [{ name, abs: localMp4, seconds }] : [];
  const lines = formatBalanceLines({ files, where: g.ok ? where : '', spent: { colabUnits: spent }, remain });
  const detail = [
    `- プロンプト: ${task.prompt.slice(0, 300)}${task.prompt.length > 300 ? '…' : ''}`,
    `- 秒数: ${task.seconds} / 縦横: ${task.size === '768p-portrait' ? '縦 768x1344（ショート向け）' : '横 1344x768'} / ${task.turbo ? '高速モード（turbo・8 ステップ）' : `高画質（${task.steps} ステップ）`}`,
    `- GPU: ${g.gpu || '確保できず'}${g.info && g.info.seed != null ? ` / seed ${g.info.seed}` : ''}`,
  ];
  if (!task.styleSpecified) detail.push(`- ${STYLE_HINT}`);
  if (!g.ok) return { status: 'failed', result: `${lines}\n\n動画の生成に失敗しました: ${g.error}\n\n${detail.join('\n')}`, files: [] };
  detail.push(`- ${DISCLOSURE}`);
  detail.push(g.tagged ? `- mp4 のメタデータ（comment / description）に "${AI_TAG}" を記録済み` : `- ⚠ mp4 へのメタデータ付与に失敗しました（公開時は説明欄等で AI 生成を明記）`);
  return { status: 'done', result: `${lines}\n\n${detail.join('\n')}`, files };
}

// doctor 用: CLI の有無・認証（colab usage が通るか）・残高
export async function colabHealth({ colab = null } = {}) {
  const bin = findBin('colab');
  if (!bin && !colab) return { ok: false, note: 'colab CLI なし（~/.local/bin/colab。uv tool install google-colab-cli）' };
  const b = await colabBalance(colab || makeColabRunner(bin));
  if (!b.ok) return { ok: false, note: `colab CLI あり（${bin}）だが colab usage が通りません（認証が必要: gcloud auth application-default login …）: ${b.error}` };
  return { ok: true, balance: b.balance, note: `colab CLI あり（${bin}）/ 認証OK / 残り ${b.balance.toFixed(2)} ユニット / VM 用スクリプト ${fs.existsSync(H3_SCRIPT) ? 'あり' : 'なし'}` };
}
