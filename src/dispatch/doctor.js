// src/dispatch/doctor.js — `cerebralos dispatch doctor`: このマシンが実行役として動けるかの診断
// 診断は「存在・バージョン・ログイン状態の読み取り」が基本。agy は一切起動しない（gemini は Gemini API 直呼び: キー有無とモデル一覧の疎通だけ確認）。
// --deep を付けると claude / codex / grok を実際に 1 回だけ非対話実行して認証を確かめる（grok は権限制限フラグ込み・作業フォルダは tmp）。
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { loadHubConfig, hubCaps, call } from '../hub-client.js';
import { loadDispatchConfig, OLLAMA, EMBED_MODEL, outRoot, workRoot, examplesPath, DISABLED_REASON } from './config.js';
import { BIN_NAME, findBin, childEnv, GROK_MIN, verCmp, binVersion as version, grokAuth, buildCommand, buildPrompt } from './exec.js';
import { geminiHealth } from './gemini.js';
import { jevStatus } from './jev.js';
import { elevenHealth } from './elevenlabs.js';
import { colabHealth } from './colab-video.js';
import { isLow } from './balance.js';

export async function doctor({ deep = false } = {}) {
  const rows = [];
  const add = (level, name, detail) => rows.push({ level, name, detail }); // level: ok / warn / ng
  const cfg = loadDispatchConfig();

  add('ok', '設定', `machine=${cfg.machine} role=${cfg.role} inbox_pull=${cfg.inboxPull} enabled=${cfg.enabled.join(',') || '(なし)'}`);
  add(process.versions.node.split('.')[0] >= 20 ? 'ok' : 'ng', 'node', process.version);

  // ollama
  const ob = ['/opt/homebrew/bin/ollama', '/usr/local/bin/ollama'].find((p) => fs.existsSync(p));
  add(ob ? 'ok' : 'ng', 'ollama', ob ? `${ob}` : '未導入（brew install ollama）');
  let models = [];
  try {
    const r = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(5000) });
    models = (await r.json()).models.map((m) => m.name);
    add('ok', 'ollama サーバー', `応答あり（モデル ${models.length} 件）`);
  } catch { add('ng', 'ollama サーバー', `応答なし（${OLLAMA}）。ollama serve / アプリの起動が必要`); }
  const has = (n) => models.some((m) => m === n || m === `${n}:latest` || m.startsWith(`${n}:`));
  add(has(EMBED_MODEL) ? 'ok' : 'ng', `モデル ${EMBED_MODEL}`, has(EMBED_MODEL) ? 'あり' : `なし → ollama pull ${EMBED_MODEL}`);
  add(models.includes(cfg.genModel) ? 'ok' : 'ng', `モデル ${cfg.genModel}`, models.includes(cfg.genModel) ? 'あり' : `なし → ollama pull ${cfg.genModel}`);

  // 担当 CLI
  for (const a of ['claude', 'codex', 'gemini', 'grok']) {
    const enabled = cfg.enabled.includes(a);
    if (a === 'gemini') {
      const h = await geminiHealth();
      add(h.ok ? 'ok' : enabled ? 'ng' : 'warn', 'gemini (API 直呼び)', `${h.note}${enabled ? '' : ' / このマシンでは実行を無効化中'}。ツールは google_search のみ（ローカルのファイル・シェルには触れない）。agy は起動しない`);
      continue;
    }
    const bin = findBin(BIN_NAME[a]);
    if (!bin) { add(enabled ? 'ng' : 'warn', `CLI ${BIN_NAME[a]}`, '未導入'); continue; }
    const v = version(bin);
    if (a === 'grok') {
      const vm = (v || '').match(/(\d+)\.(\d+)\.(\d+)/);
      const old = vm ? verCmp(vm.slice(1).map(Number), GROK_MIN) < 0 : true;
      const au = grokAuth();
      add(old || !au.ok ? (enabled ? 'ng' : 'warn') : 'ok', 'CLI grok', `${v || '?'} / ${old ? `CLI が古い（${GROK_MIN.join('.')} 以上が必要。grok update）` : '版OK'} / ${au.note} / 権限: sandbox strict + deny Bash・MCP・~/.grok + 書込は ./out のみ${enabled ? '' : ' / このマシンでは実行を無効化中'}`);
      if (deep && !old && au.ok && enabled) {
        // 実際に 1 回だけ、本番と同じ権限フラグで実行（作業フォルダは tmp。ブラウザ承認が出ると止まるので 90 秒で打ち切る）
        const wd = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-grok-'));
        fs.mkdirSync(path.join(wd, 'out'));
        const c = buildCommand('grok', { bin, prompt: buildPrompt('grok', '「OK」とだけ答えて'), workDir: wd });
        const r = spawnSync(c.cmd, c.args, { encoding: 'utf-8', timeout: 90000, env: { ...childEnv(), ...c.env }, stdio: ['ignore', 'pipe', 'pipe'], cwd: wd });
        add(r.status === 0 && /OK/.test(r.stdout || '') ? 'ok' : 'ng', '非対話実行 grok', r.status === 0 ? '成功（認証OK・ダイアログなし）' : `失敗（終了コード ${r.status}${r.error ? ' ' + r.error.code : ''}）: ${(r.stderr || r.stdout || '').replace(/\s+/g, ' ').slice(0, 160)}`);
        fs.rmSync(wd, { recursive: true, force: true });
      }
      continue;
    }
    add(v ? 'ok' : 'ng', `CLI ${a}`, `${v || '--version 失敗'}（${bin}）${enabled ? '' : ' / このマシンでは実行を無効化中'}`);
    if (deep && v && enabled) {
      const args = a === 'claude'
        ? ['-p', '「OK」とだけ答えて', '--tools', '', '--permission-mode', 'dontAsk', '--strict-mcp-config', '--no-session-persistence', '--max-budget-usd', '0.5']
        : ['exec', '--ignore-user-config', '--sandbox', 'read-only', '--skip-git-repo-check', '--ephemeral', '「OK」とだけ答えて'];
      const r = spawnSync(bin, args, { encoding: 'utf-8', timeout: 120000, env: childEnv(), stdio: ['ignore', 'pipe', 'pipe'], cwd: os.tmpdir() });
      add(r.status === 0 ? 'ok' : 'ng', `非対話実行 ${a}`, r.status === 0 ? '成功（認証OK）' : `失敗（終了コード ${r.status}）: ${(r.stderr || r.stdout || '').replace(/\s+/g, ' ').slice(0, 160)}`);
    }
  }
  // 生成系（API・CLI の疎通と残高。生成はしない）
  {
    const en = cfg.enabled.includes('elevenlabs');
    const h = await elevenHealth();
    const low = h.ok && h.sub && isLow({ eleven: h.sub });
    add(h.ok ? (low ? 'warn' : 'ok') : en ? 'ng' : 'warn', 'elevenlabs (API 直呼び)', `${low ? '⚠ 残りわずか / ' : ''}${h.note} / モデル ${cfg.elevenlabsModel} / 日次上限 ${cfg.elevenlabsDailyChars.toLocaleString('en-US')} 文字${en ? '' : ' / このマシンでは実行を無効化中'}`);
  }
  {
    const en = cfg.enabled.includes('colab_video');
    const h = await colabHealth();
    const low = h.ok && isLow({ colab: { balance: h.balance, monthly: cfg.colabUnitsMonthly } });
    add(h.ok ? (low ? 'warn' : 'ok') : en ? 'ng' : 'warn', 'colab_video (Colab CLI)', `${low ? '⚠ 残りわずか / ' : ''}${h.note} / 1 カードの上限 ${cfg.colabVideoTimeoutMin} 分${en ? '' : ' / このマシンでは実行を無効化中'}`);
  }
  // Jev 影判定（API への疎通確認はしない。キーは有無だけ表示し、値は出さない）
  const jv = jevStatus(cfg);
  add(jv.enabled && !jv.hasKey ? 'warn' : 'ok', 'Jev 影判定 (TypeSafe)', `${jv.enabled ? '有効' : '無効（dispatch.json の jev_shadow）'} / キー${jv.hasKey ? `あり（${jv.keySource}）` : 'なし（TYPESAFE_API_KEY: env / ~/.env）'} / 今日の呼び出し ${jv.today}/${jv.cap} 回。本番の判定には使わない（比較ログのみ）`);
  add(fs.existsSync('/usr/bin/caffeinate') ? 'ok' : 'warn', 'caffeinate', fs.existsSync('/usr/bin/caffeinate') ? 'あり（実行中のアイドルスリープ抑止）' : 'なし');
  add(fs.existsSync('/usr/bin/osascript') ? 'ok' : 'warn', 'osascript', fs.existsSync('/usr/bin/osascript') ? 'あり（成果物の到着通知）' : 'なし（通知は notifications.log のみ）');

  // パス
  for (const [n, p] of [['作業フォルダ', workRoot()], ['成果物フォルダ', outRoot()]]) {
    try { fs.mkdirSync(p, { recursive: true }); fs.accessSync(p, fs.constants.W_OK); add('ok', n, p); } catch (e) { add('ng', n, `${p} に書けません: ${e.message}`); }
  }
  add(fs.existsSync(examplesPath()) ? 'ok' : 'warn', '担当判定の例', fs.existsSync(examplesPath()) ? examplesPath() : '未作成（初回判定時に自動作成）');

  // hub
  try {
    const hub = loadHubConfig();
    const caps = await hubCaps(hub);
    add(caps.d ? 'ok' : 'ng', 'hub', `${hub.url} / dispatch=${caps.d ? '対応' : '未対応(要 deploy)'} / 成果物保管=${caps.artifact_storage || '?'}（上限 ${caps.artifact_max ? Math.round(caps.artifact_max / 1048576) + 'MB' : '?'}）`);
    if (caps.d) {
      const hb = await call(hub, 'GET', '/api/sync/dispatch/queue');
      add('ok', 'hub キュー', `未判定 ${hb.unjudged.length} / 実行待ち ${hb.runnable}`);
    }
  } catch (e) { add('ng', 'hub', e.message); }

  // launchd（macOS）
  if (process.platform === 'darwin') {
    const r = spawnSync('/bin/launchctl', ['list'], { encoding: 'utf-8' });
    const loaded = /com\.cerebralos\.dispatch/.test(r.stdout || '');
    add(loaded ? 'ok' : 'warn', 'launchd com.cerebralos.dispatch', loaded ? 'ロード済み' : '未ロード（scripts/install-dispatch-launchd.sh）');
  }

  const mark = { ok: 'OK  ', warn: '要確認', ng: 'NG  ' };
  for (const r of rows) console.log(`[${mark[r.level]}] ${r.name}: ${r.detail}`);
  const ng = rows.filter((r) => r.level === 'ng').length;
  console.log(ng ? `\nNG が ${ng} 件あります。` : '\n実行役として動ける状態です（要確認の項目は上を参照）。');
  return { rows, ng };
}
