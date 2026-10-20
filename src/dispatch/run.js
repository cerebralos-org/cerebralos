// src/dispatch/run.js — `cerebralos dispatch run`: ハートビート → 判定 → 実行
// launchd com.cerebralos.dispatch が 120 秒ごとに起動。ロックで多重起動を防ぐ（実行中は別プロセスが判定とハートビートだけ行う）。
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { brainPath, call, hubCaps, loadHubConfig } from '../hub-client.js';
import { writeMemory } from '../write.js';
import { isErrorText } from '../write.js';
import { CEREBRALOS_DIR } from '../util.js';
import { loadDispatchConfig, LIMITS, DISABLED_REASON, workRoot, outputsAllowedHere, GEN_ROUTES, GEN_MIN_CONFIDENCE } from './config.js';
import { routeTask, addExample } from './route.js';
import { judgeApproval, judgeGenerate } from './judge.js';
import { isAcquire } from './rules.js';
import { classifyImplement, handleImplRequests, runImplementCard } from './implement.js';
import { loadRepos, reposForMachine } from './repos.js';
import { ACQUIRE_RULE, BIN_NAME, buildCommand, buildPrompt, findBin, grokUsable, prepareWorkDir, runProcess, summarizeError, summarizeResult, trimToSummary } from './exec.js';
import { resolveGeminiKey, runGemini } from './gemini.js';
import { writeContext, withRefLine, REF_RESERVE, CONTEXT_RULE } from './context.js';
import { proposeFromRun, postProposal, applySkillInstalls, syncSkillLinks } from './skill-acquire.js';
import { collectOutputs, outputDirName, uploadArtifacts, syncArtifacts } from './artifacts.js';
import { runClipCard, clipQueryText } from './clip.js';
import { runJevShadow } from './jev.js';
import { resolveElevenKey, runElevenLabs, judgeElevenCap } from './elevenlabs.js';
import { runColabVideo, H3_SCRIPT } from './colab-video.js';
import { makeHubLock } from '../live-client.js';
import { buildRawOutput, cliVersion, saveRawOutput } from './raw-output.js';

const log = (...a) => console.log(`[dispatch ${new Date().toISOString()}]`, ...a);
const lockFile = () => brainPath('dispatch.lock');

// ---------- ロック ----------
function pidAlive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }
export function readLock() {
  try {
    const l = JSON.parse(fs.readFileSync(lockFile(), 'utf-8'));
    const age = Date.now() - (l.started || 0);
    if (!pidAlive(l.pid) || age > 40 * 60 * 1000) return null; // 死んだプロセス・古すぎるロックは無効
    return l;
  } catch { return null; }
}
export function acquireLock() {
  fs.mkdirSync(brainPath(), { recursive: true });
  if (readLock()) return false;
  try { fs.unlinkSync(lockFile()); } catch { /* 無し */ }
  try {
    fs.writeFileSync(lockFile(), JSON.stringify({ pid: process.pid, started: Date.now(), card: null }), { flag: 'wx' });
    return true;
  } catch { return false; }
}
const setLockCard = (card) => { try { fs.writeFileSync(lockFile(), JSON.stringify({ pid: process.pid, started: Date.now(), card })); } catch { /* ok */ } };
export function releaseLock() { try { const l = JSON.parse(fs.readFileSync(lockFile(), 'utf-8')); if (l.pid === process.pid) fs.unlinkSync(lockFile()); } catch { /* ok */ } }

// ---------- 実行可能な担当（enabled ∩ CLI あり）----------
export function agentAvailability(cfg) {
  const allowed = [], reasons = {};
  for (const a of ['claude', 'codex', 'gemini', 'grok', ...GEN_ROUTES]) {
    if (!cfg.enabled.includes(a)) { reasons[a] = DISABLED_REASON[a]; continue; }
    if (a === 'elevenlabs') { // API 直呼び: キーがあれば実行可
      if (!resolveElevenKey()) { reasons[a] = 'ELEVENLABS_API_KEY が見つかりません（env / ~/.env）。'; continue; }
      allowed.push(a);
      continue;
    }
    if (a === 'colab_video') { // colab CLI と VM 用スクリプトがあれば実行可（認証は実行時に colab usage で確かめる）
      if (!findBin('colab')) { reasons[a] = 'colab CLI が見つかりません（~/.local/bin/colab。このマシンに未導入）。'; continue; }
      if (!fs.existsSync(H3_SCRIPT)) { reasons[a] = `VM 用スクリプトがありません（${H3_SCRIPT}）。`; continue; }
      allowed.push(a);
      continue;
    }
    if (a === 'gemini') { // CLI ではなく API 直呼び: キーがあれば実行可
      if (!resolveGeminiKey()) { reasons[a] = 'GEMINI_API_KEY が見つかりません（env / ~/.cerebralos/.brain/gemini.key / ~/.env）。'; continue; }
      allowed.push(a);
      continue;
    }
    const bin = findBin(BIN_NAME[a]);
    if (!bin) { reasons[a] = `${BIN_NAME[a]} が見つかりません（このマシンに未導入）。`; continue; }
    if (a === 'grok') { const g = grokUsable(bin); if (!g.ok) { reasons[a] = g.reason; continue; } }
    allowed.push(a);
  }
  return { allowed, reasons };
}

// 実装モードで扱えるリポジトリ名（repos.json の machines に載っていて、実在する git リポジトリ）
function safeRepoNames(cfg) {
  try { return reposForMachine(cfg.machine).map((r) => r.name); } catch { return []; }
}

// ---------- hub 呼び出し ----------
async function heartbeat(hub, cfg, runningCard) {
  try {
    return await call(hub, 'POST', '/api/sync/dispatch/heartbeat', {
      machine: cfg.machine, role: cfg.role, running_card: runningCard || null,
      info: { enabled: cfg.enabled, pid: process.pid, repos: safeRepoNames(cfg) },
    });
  } catch (e) {
    log(`ハートビート失敗: ${e.message}`);
    return null;
  }
}

// ---------- 判定 ----------
// 生成系の判定（judgeGenerate）を使うか: 担当が生成系で、やなぎの指定か埋め込みの信頼度が十分なとき
export const useGenJudge = (route, confidence, routeBy) => GEN_ROUTES.includes(route) && (routeBy === 'yanagi' || Number(confidence) >= GEN_MIN_CONFIDENCE);
// deps.jevShadow: Jev の影判定（テストで差し替え可）。本番の判定結果には一切使わない
export async function judgePending(hub, cfg, max = 5, caps = {}, { jevShadow = runJevShadow } = {}) {
  const q = await call(hub, 'GET', '/api/sync/dispatch/queue');
  let n = 0;
  for (const c of q.unjudged.slice(0, max)) {
    try {
      // 実装モード: 開発系の依頼＋対象リポジトリが特定できる → 常に要承認（task_kind=implement）。特定できない → needs_info（カードに質問）
      const impl = isAcquire(c.text) || !caps.implement ? null : classifyImplement(c.text, loadRepos(), { routeBy: c.route_by, route: c.route });
      if (impl) {
        const body = impl.kind === 'implement'
          ? { id: c.id, text: c.text, route: impl.route, route_confidence: 1, needs_approval: true, approval_reason: impl.reason, task_kind: 'implement', repo: impl.repo }
          : { id: c.id, text: c.text, route: c.route_by === 'yanagi' && c.route ? c.route : 'codex', route_confidence: 0, needs_approval: true, approval_reason: impl.question, needs_info: true, question: impl.question };
        const res = await call(hub, 'POST', '/api/sync/dispatch/judge', body);
        log(`判定 ${c.id}: ${impl.kind === 'implement' ? `実装モード 担当=${impl.route} repo=${impl.repo} 要承認` : '実装の対象リポジトリが不明 → 質問(needs_info)'} → ${res.ok ? res.status : res.reason}`);
        n++;
        continue;
      }
      const r = await routeTask(c.text, { model: cfg.embedModel });
      const route = c.route_by === 'yanagi' && c.route ? c.route : r.route;
      // 生成系（elevenlabs / colab_video）: ハードルールに当たらなければ自動実行可。ElevenLabs は日次上限を超える見込みなら要承認。
      // 埋め込みの信頼度が低いときは通常の判定（Gemma）に回す（誤った担当で課金が走るのを防ぐ）
      const gen = useGenJudge(route, r.confidence, c.route_by);
      const j = gen
        ? judgeGenerate(c.text, { capCheck: route === 'elevenlabs' ? (t) => judgeElevenCap(t, { cap: cfg.elevenlabsDailyChars }) : null })
        : await judgeApproval(c.text, { model: cfg.genModel });
      const res = await call(hub, 'POST', '/api/sync/dispatch/judge', {
        id: c.id, text: c.text, route, route_confidence: r.confidence, needs_approval: j.needs_approval, approval_reason: j.reason,
        task_kind: j.kind === 'acquire' ? 'acquire' : null,
      });
      log(`判定 ${c.id}: 担当=${route}(${Math.round(r.confidence * 100)}%) ${j.needs_approval ? '要承認' : '自動OK'}${j.kind === 'acquire' ? ' [スキル導入]' : ''} [${j.source}] → ${res.ok ? res.status : res.reason}`);
      n++;
      // Jev の影判定: 本番の判定を hub に送った「後」に行い、結果は比較ログ（state/jev-shadow.jsonl）にだけ残す。失敗しても無視
      if (cfg.jevShadow) {
        try {
          await jevShadow({
            card: { id: c.id, text: c.text }, cfg, log,
            gemma: { route: r.route, route_confidence: r.confidence, final_route: route, forced: r.forced || null, needs_approval: j.needs_approval, source: j.source, kind: j.kind },
          });
        } catch { /* 影判定の失敗は本番に影響させない */ }
      }
    } catch (e) {
      log(`判定を保留 ${c.id}: ${e.message}`); // 埋め込みが使えない等。次回再試行（誤った担当で確定させない）
    }
  }
  return n;
}

// 「担当を変更」の正解例を取り込む（inbox を取り込める実行役だけ）
export async function applyRouteCorrections(hub) {
  const { items } = await call(hub, 'GET', '/api/sync/pull?kinds=route_correction');
  const ack = [];
  for (const it of items) {
    try {
      const p = JSON.parse(it.body || '{}');
      if (addExample(p.route, p.text, 'yanagi')) log(`正解例を追加: ${p.route} ← ${String(p.text).slice(0, 30)}`);
      ack.push(it.id);
    } catch { ack.push(it.id); }
  }
  if (ack.length) await call(hub, 'POST', '/api/sync/ack', { ids: ack });
  return ack.length;
}

// ---------- 1 カードの実行 ----------
export async function executeCard(hub, cfg, card, caps, available = null) {
  const agent = card.route;
  const workDir = prepareWorkDir(workRoot(), card.id);
  const useContext = !/^(0|false|no|off)$/i.test(process.env.CEREBRALOS_DISPATCH_CONTEXT || '');
  fs.writeFileSync(path.join(workDir, 'task.md'), `# ${card.id}\n\n${card.text}\n${useContext ? `\n---\n${CONTEXT_RULE}\n` : ''}`);
  const ac = new AbortController();
  let leaseLost = false;
  const renew = setInterval(async () => {
    try {
      const r = await call(hub, 'POST', '/api/sync/dispatch/renew', { id: card.id, machine: cfg.machine });
      if (!r.ok) { leaseLost = true; ac.abort(); log(`リースを失ったため中断: ${card.id}`); }
    } catch (e) { log(`リース延長に失敗: ${e.message}`); }
    setLockCard(card.id); // ロックの時刻も更新（長い実装モードの実行中にロックが失効扱いにならないように）
    await heartbeat(hub, cfg, card.id);
  }, LIMITS.leaseRenewMs);
  // MacBook のアイドルスリープを実行中だけ抑止（蓋閉じは防げない → リースで他の実行役が引き継ぐ）
  let caff = null;
  if (process.platform === 'darwin') {
    try { caff = spawn('/usr/bin/caffeinate', ['-i', '-w', String(process.pid)], { stdio: 'ignore' }); caff.on('error', () => {}); } catch { /* なくても動く */ }
  }
  setLockCard(card.id);
  const finish = (status, result, outputDir, impl, extra = {}) =>
    call(hub, 'POST', '/api/sync/dispatch/finish', { ...extra, id: card.id, machine: cfg.machine, status, result, output_dir: outputDir || undefined, impl: impl || undefined })
      .then((r) => { if (!r.ok) log(`finish が受理されませんでした（リース喪失の可能性）: ${card.id}`); return r; });
  try {
    const lastMsgFile = path.join(workDir, 'last-message.txt');
    // 実行前に CerebraLOS の文脈を検索して context.md に書く。失敗しても実行は止めない（ログだけ残す）
    let ctx = null;
    const isClip = card.task_kind === 'clip';
    const isGen = GEN_ROUTES.includes(agent) && card.task_kind !== 'implement' && !isClip;
    if (isGen) {
      // 生成系: CerebraLOS の文脈は使わない・渡さない（外部 API に記憶を出さない）
      return leaseLost ? null : await runGenCard({ hub, cfg, card, caps, workDir, signal: ac.signal, finish, isLeaseLost: () => leaseLost });
    }
    if (useContext) {
      // クリップ: 検索語は URL ではなくメモとパスの語から。今の焦点に加えて now も添える（関連度の判断に使う）
      ctx = await writeContext({ workDir, text: isClip ? clipQueryText(card.clip_url, card.clip_note || '') : card.text, agent, machine: cfg.machine, id: card.id, includeNow: isClip, log });
      log(`文脈 ${card.id}: 記録 ${ctx.count} 件 / history ${ctx.historyCount} 件（開示範囲=${ctx.scope}）${ctx.error ? ' ※一部失敗' : ''}`);
    }
    if (isClip) {
      // クリップ: 担当 → claude の順で読む。結果は peripheral/clips/ と hub のカードへ（clip.js）
      const finishClip = (status, result, extra = {}) =>
        call(hub, 'POST', '/api/sync/dispatch/finish', { id: card.id, machine: cfg.machine, status, result, ...extra })
          .then((r) => { if (!r.ok) log(`finish が受理されませんでした（リース喪失の可能性）: ${card.id}`); return r; });
      const avail = available || agentAvailability(cfg).allowed;
      // 生の出力（担当ごとの試行）は raw-output.md として hub へ（実行記録の証拠。cerebralos-outputs には置かない）
      const saveRaw = (content) => saveRawOutput({ hub, cardId: card.id, dirName: outputDirName(card), workDir, content, machine: cfg.machine, maxBytes: caps.artifact_max || 25 * 1024 * 1024, log });
      const r = await runClipCard({ cfg, card, workDir, ctx, signal: ac.signal, log, finish: finishClip, available: avail, deps: { saveRaw } });
      return leaseLost ? null : r;
    }
    if (card.task_kind === 'implement') {
      // 実装モード: git worktree で codex / claude が実装 → 実行役が commit → status=implemented（implement.js）
      return await runImplementCard({ hub, cfg, card, caps, workDir, signal: ac.signal, log, finish, ctx });
    }
    let r;
    let cli = {};
    const t0 = Date.now();
    if (agent === 'gemini') {
      // CLI を使わず Gemini API を直接呼ぶ（Google 検索グラウンディングのみ。ローカルのファイル・シェルには触れない）
      log(`実行開始 ${card.id} 担当=gemini(API) 作業=${workDir}`);
      r = await runGemini({ text: card.task_kind === 'acquire' ? `${card.text}\n\n${ACQUIRE_RULE}` : card.text, contextMd: ctx ? ctx.markdown : '', timeoutMs: LIMITS.timeoutMs, signal: ac.signal, model: cfg.geminiModel });
      cli = { cli: 'gemini-api', model: r.model || cfg.geminiModel || '' };
    } else {
      const bin = findBin(BIN_NAME[agent]);
      if (!bin) return await finish('failed', `${BIN_NAME[agent]} が見つかりません。`);
      if (agent === 'grok') { const g = grokUsable(bin, { refresh: true }); if (!g.ok) return await finish('failed', g.reason); }
      const cmd = buildCommand(agent, { bin, prompt: buildPrompt(agent, card.text, { kind: card.task_kind }), workDir, lastMsgFile });
      log(`実行開始 ${card.id} 担当=${agent} 作業=${workDir}`);
      r = await runProcess({ ...cmd, timeoutMs: LIMITS.timeoutMs, signal: ac.signal });
      cli = { cli: BIN_NAME[agent], cli_version: cliVersion(bin) };
    }
    if (leaseLost) return null;
    let output = r.output;
    const fromLastMsg = agent === 'codex' && fs.existsSync(lastMsgFile);
    if (fromLastMsg) output = fs.readFileSync(lastMsgFile, 'utf-8');
    // 生の最終出力（grok は要約に切る前の stdout）を raw-output.md として hub へ。成功・失敗どちらでも残す（実行した証拠）
    const dirName = outputDirName(card);
    const raw = buildRawOutput({
      cardId: card.id, machine: cfg.machine,
      sections: [{ agent, ok: r.ok && !r.timedOut, code: r.code, exec_s: Math.round((Date.now() - t0) / 1000), output, error: r.ok ? '' : r.error, source: fromLastMsg ? 'last message（codex -o）' : agent === 'gemini' ? 'Gemini API の応答' : 'stdout' }],
    });
    await saveRawOutput({ hub, cardId: card.id, dirName, workDir, content: raw.content, machine: cfg.machine, maxBytes: caps.artifact_max || 25 * 1024 * 1024, log });
    const runMeta = { agent, ...cli, exec_s: Math.round((Date.now() - t0) / 1000), exit_code: Number.isFinite(r.code) ? r.code : null, raw_bytes: raw.bytes, raw_truncated: raw.truncated };
    const finishRun = (status, result, outputDir) => finish(status, result, outputDir, undefined, { run_meta: runMeta });
    if (agent === 'grok') output = trimToSummary(output);
    if (r.timedOut) return await finishRun('failed', `タイムアウト（${LIMITS.timeoutMs / 60000} 分）で中断しました。`);
    if (!r.ok) return await finishRun('failed', `実行に失敗しました（終了コード ${r.code}）: ${summarizeError(r.error || output)}`);
    if (isErrorText(output)) return await finishRun('failed', `出力がエラー文のみでした: ${summarizeError(output)}`);

    // 成果物: out/ と result.md だけを cerebralos-outputs/ へ → hub へ
    // launchd から ~/Documents を触ると macOS の許可ダイアログ待ちで止まるため、許可が無い間は作業フォルダ内に置いて hub へ上げる（Documents へは対話実行の sync が届ける）
    const staged = !outputsAllowedHere();
    const files = collectOutputs(workDir, dirName, output, staged ? path.join(workDir, 'deliver') : undefined);
    const ups = await uploadArtifacts(hub, card.id, dirName, files, cfg.machine, caps.artifact_max || 25 * 1024 * 1024).catch((e) => { log(`成果物アップロード失敗: ${e.message}`); return files.map((f) => ({ ...f, stored: false })); });
    const macOnly = ups.filter((f) => !f.stored).length;

    // 全文は peripheral/dispatch/ へ（source=dispatch-<agent>）
    let memNote = '';
    try {
      const w = await writeMemory({
        body: `${output.slice(0, 100000)}\n\n---\n依頼: ${card.text.slice(0, 500)}\n成果物: ${files.map((f) => f.path).join(', ')}\n`,
        topic: `[dispatch] ${card.text.split('\n')[0].slice(0, 60)}`,
        from: `dispatch-${agent}`, subdir: 'dispatch', type: 'note', tags: ['dispatch', agent],
        brainDir: CEREBRALOS_DIR,
      });
      if (w.skipped) memNote = '（peripheral への保存はエラー文ガードでスキップ）';
    } catch (e) { memNote = `（peripheral への保存に失敗: ${e.message}）`; }

    let summary = ctx ? withRefLine(summarizeResult(output, LIMITS.resultChars - REF_RESERVE), output) : summarizeResult(output);
    summary += `\n\n（担当: ${agent} / 実行: ${cfg.machine} / 成果物 ${files.length} 件${macOnly ? `（うち ${macOnly} 件は ${cfg.machine} にのみ保存）` : ''}）${memNote}`;
    log(`完了 ${card.id}: 成果物 ${files.length} 件（hub 保管 ${files.length - macOnly} / ${cfg.machine} のみ ${macOnly}）→ ${dirName}${staged ? '（バックグラウンドのため作業フォルダに配置。cerebralos-outputs へは対話実行の hub sync が届ける）' : ''}`);
    // スキル導入カード: 完了にせず、Mac が隔離取得→検査→レビュー→配属判定して「導入提案」を hub に出して止まる（承認は hub で本人が行う）
    if (card.task_kind === 'acquire' && caps.skills) {
      const pr = await proposeFromRun({ hub, cfg, card, workDir, output, logf: log });
      if (!pr.ok) return await finishRun('failed', `下調べは完了しましたが、導入提案を作れませんでした: ${pr.error}\n\n${summary}`.slice(0, LIMITS.resultChars), dirName);
      const res = await postProposal(hub, { card: card.id, machine: cfg.machine, proposal: pr.proposal, summary: summary.slice(0, LIMITS.resultChars), output_dir: dirName });
      log(`スキル導入提案 ${card.id}: ${pr.proposal.name} risk=${pr.proposal.risk} 配属案=${pr.proposal.suggested_holders.join(',')} → ${res.ok ? res.status : res.reason}`);
      return res;
    }
    return await finishRun('done', summary.slice(0, LIMITS.resultChars), dirName);
  } catch (e) {
    log(`実行エラー ${card.id}: ${e.message}`);
    return await finish('failed', `内部エラー: ${summarizeError(e.message)}`).catch(() => null);
  } finally {
    clearInterval(renew);
    if (caff) { try { caff.kill(); } catch { /* ok */ } }
    setLockCard(null);
  }
}

// ---------- 生成系（elevenlabs / colab_video）の 1 カード ----------
// 結果の先頭 3 行は「生成物 / 今回の消費 / 残り」（balance.js）。Slack の完了報告の要約にそのまま入る。
// status: done（成果物あり）/ failed / needs_approval（日次上限超過 → 承認待ちへ戻す）/ needs_attention（許可外の声・本文から読み取れない）
export async function runGenCard({ hub, cfg, card, caps = {}, workDir, signal, finish, isLeaseLost = () => false, runners = {} }) {
  const agent = card.route;
  const dirName = outputDirName(card);
  const where = `cerebralos-outputs/${dirName}/`;
  log(`実行開始 ${card.id} 担当=${agent} 作業=${workDir}`);
  const run = agent === 'elevenlabs' ? (runners.elevenlabs || runElevenLabs) : (runners.colab_video || runColabVideo);
  // Colab を使う担当は実行前に hub の札（colab:<種類>）を取る。取れなければ deferred（承認済みのまま少し後に再試行）
  const lock = agent === 'colab_video'
    ? (runners.lock !== undefined ? runners.lock : makeHubLock(hub, { agent: 'colab_video', machine: cfg.machine, session: `dispatch:${card.id}`, log: (m) => log(`${card.id}: ${m}`) }))
    : null;
  const r = await run({ card, cfg, workDir, where, signal, log: (m) => log(`${card.id}: ${m}`), lock });
  if (isLeaseLost()) return null;
  if (r.status === 'deferred') {
    log(`延期 ${card.id}: ${String(r.result).split('\n')[0].slice(0, 160)}`);
    return await finish('deferred', String(r.result).slice(0, LIMITS.resultChars), undefined, undefined, { retry_after: r.retry_after });
  }
  if (r.status !== 'done') {
    log(`${r.status} ${card.id}: ${String(r.result).split('\n')[0].slice(0, 160)}`);
    return await finish(r.status, String(r.result).slice(0, LIMITS.resultChars));
  }
  const staged = !outputsAllowedHere();
  const files = collectOutputs(workDir, dirName, r.result, staged ? path.join(workDir, 'deliver') : undefined);
  const ups = await uploadArtifacts(hub, card.id, dirName, files, cfg.machine, caps.artifact_max || 25 * 1024 * 1024).catch((e) => { log(`成果物アップロード失敗: ${e.message}`); return files.map((f) => ({ ...f, stored: false })); });
  const macOnly = ups.filter((f) => !f.stored).length;
  let memNote = '';
  try {
    const w = await writeMemory({
      body: `${r.result}\n\n---\n依頼: ${card.text.slice(0, 500)}\n成果物: ${files.map((f) => f.path).join(', ')}\n`,
      topic: `[dispatch] ${card.text.split('\n')[0].slice(0, 60)}`,
      from: `dispatch-${agent}`, subdir: 'dispatch', type: 'note', tags: ['dispatch', agent],
      brainDir: CEREBRALOS_DIR,
    });
    if (w.skipped) memNote = '（peripheral への保存はエラー文ガードでスキップ）';
  } catch (e) { memNote = `（peripheral への保存に失敗: ${e.message}）`; }
  const tail = `\n\n（担当: ${agent} / 実行: ${cfg.machine} / 成果物 ${files.length} 件${macOnly ? `（うち ${macOnly} 件は ${cfg.machine} にのみ保存）` : ''}）${memNote}`;
  const result = `${String(r.result).slice(0, LIMITS.resultChars - tail.length - 2)}${tail}`;
  log(`完了 ${card.id}: 成果物 ${files.length} 件（hub 保管 ${files.length - macOnly} / ${cfg.machine} のみ ${macOnly}）→ ${dirName}`);
  return await finish('done', result.slice(0, LIMITS.resultChars), dirName);
}

// ---------- メイン ----------
export async function dispatchRun({ noExec = false, noJudge = false } = {}) {
  const cfg = loadDispatchConfig();
  const hub = loadHubConfig();
  const caps = await hubCaps(hub);
  if (!caps.d) { log('hub が D（dispatch）に未対応のため何もしません'); return { skipped: 'hub-old' }; }
  const lock = readLock();
  const hb = await heartbeat(hub, cfg, lock ? lock.card : null);
  const out = { judged: 0, executed: 0, corrections: 0 };

  if (cfg.inboxPull) { try { out.corrections = await applyRouteCorrections(hub); } catch (e) { log(`正解例の取り込み失敗: ${e.message}`); } }
  if (cfg.inboxPull && caps.skills) { try { const r = await applySkillInstalls(hub, cfg); out.skill_installs = r.installed || 0; } catch (e) { log(`スキル導入の取り込み失敗: ${e.message}`); } }
  if (caps.skills) { try { await syncSkillLinks(hub, cfg); } catch (e) { log(`スキルのリンク同期失敗: ${e.message}`); } }
  if (!noJudge) { try { out.judged = await judgePending(hub, cfg, 5, caps); } catch (e) { log(`判定フェーズ失敗: ${e.message}`); } }
  if (outputsAllowedHere()) { try { await syncArtifacts(hub, { machine: cfg.machine, quiet: true }); } catch (e) { log(`成果物の同期失敗: ${e.message}`); } }
  if (noExec) return out;

  if (lock) { log(`別プロセスが実行中（${lock.card || '準備中'}）。判定とハートビートのみ`); return out; }
  if (!acquireLock()) return out;
  try {
    // 取り込み・破棄の依頼（この機の作業コピーに対するもの）を先に処理する
    if (caps.d) { try { out.impl_requests = await handleImplRequests(hub, cfg, log); } catch (e) { log(`取り込み依頼の処理に失敗: ${e.message}`); } }
    const { allowed, reasons } = agentAvailability(cfg);
    for (let i = 0; i < 5; i++) {
      const r = await call(hub, 'POST', '/api/sync/dispatch/claim', { machine: cfg.machine, routes: allowed, blocked_reasons: reasons, repos: safeRepoNames(cfg) });
      if (!r.ok) {
        if (r.reason === 'primary_active') log(`primary(${r.primary}) が稼働中のため実行しません（予備）`);
        else if (r.reason === 'daily_cap') log(`1 日の実行上限（${r.cap}）に達しました`);
        else if (r.reason === 'clip_daily_cap') log(`クリップの 1 日の実行上限（${r.cap}）に達しました（一般タスクとは別枠）`);
        else if (r.reason !== 'none') log(`claim できませんでした: ${r.reason}`);
        break;
      }
      await executeCard(hub, cfg, r.item, caps, allowed);
      out.executed++;
      await heartbeat(hub, cfg, null);
    }
  } finally {
    releaseLock();
  }
  return out;
}
