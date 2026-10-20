// src/dispatch/skill-acquire.js — 外部スキル導入フローの Mac 側オーケストレーション
//
//   [調べる担当]  カード(task_kind=acquire)を今の route のまま実行 → out/skill-manifest.json と説明（インストールはしない）
//   [Mac]         buildProposal: manifest 検証 → commit 固定で隔離取得 → 静的検査 → claude レビュー → 配属判定 → hub に「導入提案」を出して止まる
//   [やなぎ]      hub で配属を確認/切替して「承認して導入」（Access JWT の本人のみ）→ inbox kind=skill_install
//   [Mac]         installApproved: 再取得して指紋を照合 → 正本(skills-shared)へコピー → 台帳 → リンク → hub と peripheral に報告
//
//   外部スキルのスクリプトは一度も実行しない（読むだけ）。承認前に各 AI のスキル置き場へは一切書かない。
import fs from 'fs';
import path from 'path';
import { call } from '../hub-client.js';
import { writeMemory } from '../write.js';
import { CEREBRALOS_DIR } from '../util.js';
import { SKILL_HOLDERS, skillHomes, skillsSharedRoot, quarantineRoot, outputsAllowedHere } from './config.js';
import { validateManifest, fetchQuarantine, extractManifest, qdirName } from './skill-fetch.js';
import { scanSkill, structureFindings, maxRisk, listInstallFiles } from './skill-scan.js';
import { runAiReview, combineRisk, buildReviewMd } from './skill-review.js';
import { judgeHolders, addHolderExamples } from './skill-holders.js';
import { installSkillFiles, registerSkill, readRegistry, syncLinks, inventory } from './skill-registry.js';

const log = (...a) => console.log(`[skills ${new Date().toISOString()}]`, ...a);

// SKILL.md の frontmatter（name / description）と本文の頭
export function parseSkillMd(text) {
  const m = String(text || '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  const fm = {};
  let body = String(text || '');
  if (m) {
    body = m[2];
    for (const line of m[1].split(/\r?\n/)) {
      const k = line.match(/^([A-Za-z_-]+):\s*(.*)$/);
      if (k) fm[k[1]] = k[2].replace(/^["']|["']$/g, '').trim();
    }
  }
  return { name: fm.name || '', description: fm.description || '', body };
}

const trimFinding = (f) => ({ severity: f.severity, id: f.id, file: String(f.file).slice(0, 120), line: f.line, message: f.message, excerpt: f.excerpt });

// manifest(raw) から hub に出す提案を作る。deps で各段を差し替え可（テスト用）
export async function buildProposal(rawManifest, { fetchOpts = {}, review, judge = judgeHolders, logf = log } = {}) {
  const v = validateManifest(rawManifest);
  if (!v.ok) throw new Error(`manifest 不正: ${v.errors.join(' / ')}`);
  const mf = v.manifest;
  logf(`隔離取得: ${mf.source_repo} @ ${mf.commit.slice(0, 8)}`);
  const f = await fetchQuarantine(mf, fetchOpts);
  const listed = listInstallFiles(f.entryDir);
  const scan = scanSkill(f.entryDir, { listed });
  scan.findings.push(...structureFindings(f.tree, f.repoDir));
  scan.risk = maxRisk(scan.risk, scan.findings.some((x) => x.severity === 'high') ? 'high' : scan.findings.some((x) => x.severity === 'medium') ? 'medium' : 'low');
  const skillMd = parseSkillMd(fs.readFileSync(path.join(f.entryDir, 'SKILL.md'), 'utf-8'));
  logf(`静的検査: risk=${scan.risk} / 指摘 ${scan.findings.length} 件 / スクリプト ${scan.scripts.length} / バイナリ ${scan.binaries.length}`);
  const rev = review ? await review({ manifest: mf, scan, entryDir: f.entryDir }) : await runAiReview({ manifest: mf, scan, repoDir: f.repoDir, entryDir: f.entryDir, qdir: f.qdir });
  const risk = combineRisk(scan.risk, rev);
  logf(`AI レビュー: ${rev.ok ? rev.risk : '失敗(' + rev.note + ')'} → 最終 risk=${risk}`);
  const reviewMd = buildReviewMd({ manifest: mf, scan, review: rev, risk, fetched: f });
  fs.writeFileSync(path.join(f.qdir, 'review.md'), reviewMd);
  fs.writeFileSync(path.join(f.qdir, 'scan.json'), JSON.stringify(scan, null, 1));
  fs.writeFileSync(path.join(f.qdir, 'manifest.json'), JSON.stringify(mf, null, 1));
  const desc = [mf.description, skillMd.description].filter(Boolean).join(' / ');
  const h = await judge({ name: mf.name, description: desc, body: skillMd.body });
  logf(`配属案: ${h.holders.join(', ') || '(なし)'}${h.note ? ` ※${h.note}` : ''}`);
  return {
    name: mf.name, description: mf.description.slice(0, 600), skill_description: skillMd.description.slice(0, 600),
    source_repo: mf.source_repo, commit: mf.commit, ref: mf.ref, entry: mf.entry, license: mf.license, homepage: mf.homepage,
    author: mf.author, version: mf.version, install_notes: mf.install_notes,
    risk, risk_detail: { static: scan.risk, ai: rev.ok ? rev.risk : null, ai_note: rev.note || '' },
    review_md: reviewMd.slice(0, 7000),
    findings: scan.findings.slice(0, 30).map(trimFinding),
    totals: scan.totals, scripts: scan.scripts.slice(0, 20), binaries: scan.binaries.slice(0, 20),
    digest: scan.digest, quarantine: qdirName(mf),
    suggested: h.detail, suggested_holders: h.holders, holder_note: h.note, ineligible: h.ineligible,
  };
}

// 調べる担当の実行結果から提案まで進める。戻り値 { ok, proposal?, error? }
export async function proposeFromRun({ hub, cfg, card, workDir, output, logf = log, deps = {} }) {
  const ex = extractManifest(workDir, output);
  if (!ex.raw) return { ok: false, error: ex.error || 'manifest がありません' };
  try {
    const proposal = await buildProposal(ex.raw, { ...deps, logf });
    return { ok: true, proposal, manifest_source: ex.source };
  } catch (e) { return { ok: false, error: e.message }; }
}

export const postProposal = (hub, { card, machine, proposal, manual = false }) =>
  call(hub, 'POST', '/api/sync/skills/propose', { card, machine, proposal, manual });

// ---------------- 承認後の導入 ----------------
// item = hub inbox の skill_install。body: { card, name, commit, source_repo, entry, content_digest, holders, suggested_holders, risk, description, learn_text }
//   戻り値 { done: ack してよいか, state, note }
export async function installApproved(item, { hub, cfg, sharedRoot = skillsSharedRoot(), homes = skillHomes(), root = quarantineRoot(), fetchOpts = {}, logf = log, report = true, memory = true } = {}) {
  let b;
  try { b = typeof item.body === 'string' ? JSON.parse(item.body) : item.body; } catch { b = null; }
  if (!b || typeof b !== 'object') return { done: true, state: 'failed', note: 'inbox の本文を読めない' };
  const fail = async (state, note) => {
    logf(`導入${state === 'needs_attention' ? '（要確認）' : '失敗'} ${b.name}: ${note}`);
    if (report && hub && b.card) await call(hub, 'POST', '/api/sync/skills/installed', { card: b.card, name: b.name, ok: false, state, note: note.slice(0, 500), machine: cfg.machine }).catch((e) => logf(`報告失敗: ${e.message}`));
    return { done: true, state, note };
  };
  const v = validateManifest({ name: b && b.name, source_repo: b && b.source_repo, commit: b && b.commit, entry: b && b.entry, description: b.description || b.name });
  if (!v.ok) return fail('failed', `承認内容が不正: ${v.errors.join(' / ')}`);
  const holders = (Array.isArray(b.holders) ? b.holders : []).filter((h) => SKILL_HOLDERS.includes(h));
  if (!holders.length) return fail('failed', '配属先が空');
  if (b.risk === 'high') return fail('failed', 'risk=high のため導入不可');
  let f;
  try { f = await fetchQuarantine(v.manifest, { root, ...fetchOpts }); } catch (e) { return fail('failed', `再取得に失敗: ${e.message}`); }
  const listed = listInstallFiles(f.entryDir);
  const scan = scanSkill(f.entryDir, { listed });
  if (b.content_digest && scan.digest !== b.content_digest) return fail('failed', '取得物の指紋が承認時と違うため導入を中止（出典側が変わった可能性）');
  if (scan.risk === 'high') return fail('failed', '再検査で high risk を検出したため導入を中止');
  let inst;
  try {
    inst = installSkillFiles(f.entryDir, sharedRoot, { name: v.manifest.name, source_repo: v.manifest.source_repo, commit: v.manifest.commit, entry: v.manifest.entry, holders, risk: b.risk || scan.risk, card: b.card, digest: scan.digest });
  } catch (e) { return fail(e.code === 'name_conflict' ? 'needs_attention' : 'failed', e.message); }
  const reg = registerSkill(sharedRoot, { name: v.manifest.name, commit: v.manifest.commit, source_repo: v.manifest.source_repo, entry: v.manifest.entry, holders, risk: b.risk || scan.risk, card: b.card, digest: scan.digest, description: String(b.description || '').slice(0, 300) });
  const links = syncLinks({ registry: reg, sharedRoot, homes });
  const mine = links.filter((l) => l.name === v.manifest.name);
  const attention = mine.filter((l) => l.state === 'exists_other' || l.state === 'error');
  const linked = mine.filter((l) => l.state === 'linked').map((l) => l.holder);
  const skipped = mine.filter((l) => l.state === 'skipped_no_home').map((l) => l.holder);
  // 配属を直したら正解例として残す
  const sug = Array.isArray(b.suggested_holders) ? b.suggested_holders : [];
  const corrected = sug.length !== holders.length || holders.some((h) => !sug.includes(h));
  if (corrected && b.learn_text) { const n = addHolderExamples(holders, b.learn_text, 'yanagi'); if (n) logf(`配属の修正を正解例に追加: ${holders.join(',')} (${n} 件)`); }
  const src = `${v.manifest.source_repo}@${v.manifest.commit.slice(0, 8)}`;
  let note = `正本 ${inst.dest}（${inst.files} ファイル）。リンク: ${linked.join(', ') || 'なし'}${skipped.length ? `（${skipped.join(', ')} はこの Mac に未導入のため後で）` : ''}。他のマシンは同期後の次回実行でリンクが張られます。`;
  if (attention.length) note = `同名が既にあるため上書きしていません: ${attention.map((a) => `${a.holder}（${a.note}）`).join(' / ')}。` + note;
  if (memory) {
    try {
      await writeMemory({ body: `スキル導入: ${v.manifest.name} → ${holders.join(', ')}（出典: ${src}、risk=${b.risk || scan.risk}、承認: やなぎ、カード ${b.card}）\n\n${note}\n`, topic: `[skills] スキル導入: ${v.manifest.name}`, from: 'dispatch-skills', subdir: 'dispatch', type: 'note', tags: ['skills', 'install', ...holders], brainDir: CEREBRALOS_DIR });
    } catch (e) { logf(`peripheral への記録に失敗: ${e.message}`); }
  }
  const state = attention.length ? 'needs_attention' : 'installed';
  if (report && hub && b.card) {
    await call(hub, 'POST', '/api/sync/skills/installed', { card: b.card, name: v.manifest.name, ok: true, state, note: note.slice(0, 500), machine: cfg.machine, holders }).catch((e) => logf(`報告失敗: ${e.message}`));
    await reportState(hub, cfg, { sharedRoot, homes, links, registry: reg }).catch(() => {});
  }
  logf(`導入 ${v.manifest.name}: ${state} / ${note}`);
  return { done: true, state, note, links: mine };
}

// ---------------- 台帳 → リンク同期と、hub への状況報告（毎回の dispatch run から） ----------------
function stateFile() { return path.join(CEREBRALOS_DIR, 'state', 'skill-report.json'); }
export async function reportState(hub, cfg, { sharedRoot, homes, links, registry }) {
  const payload = { machine: cfg.machine, inventory: inventory({ homes, sharedRoot }), links: links.map((l) => ({ name: l.name, holder: l.holder, state: l.state, note: l.note })), registry: registry.skills };
  const key = JSON.stringify(payload);
  let prev = {};
  try { prev = JSON.parse(fs.readFileSync(stateFile(), 'utf-8')); } catch { /* 初回 */ }
  if (prev.key === key && Date.now() - (prev.at || 0) < 6 * 3600 * 1000) return false;
  await call(hub, 'POST', '/api/sync/skills/report', payload);
  fs.mkdirSync(path.dirname(stateFile()), { recursive: true });
  fs.writeFileSync(stateFile(), JSON.stringify({ key, at: Date.now() }));
  return true;
}

// 台帳に従ってこのマシンのリンクを整える（MacBook でも mini でも毎回走る）。バックグラウンドで Documents に触れない時は何もしない
export async function syncSkillLinks(hub, cfg, { sharedRoot = skillsSharedRoot(), homes = skillHomes(), logf = log, force = false } = {}) {
  if (!force && !outputsAllowedHere()) return { skipped: 'background-no-documents-access' };
  const registry = readRegistry(sharedRoot);
  const links = syncLinks({ registry, sharedRoot, homes });
  const changed = links.filter((l) => l.state === 'linked' && /新規/.test(l.note) || l.state === 'unlinked');
  for (const l of changed) logf(`リンク ${l.state}: ${l.name} → ${l.holder}`);
  const bad = links.filter((l) => l.state === 'exists_other');
  for (const l of bad) logf(`要確認（上書きしない）: ${l.name} / ${l.holder}: ${l.note}`);
  if (hub) await reportState(hub, cfg, { sharedRoot, homes, links, registry }).catch((e) => logf(`状況報告に失敗: ${e.message}`));
  return { links, changed: changed.length, attention: bad.length };
}

// hub の inbox の skill_install を取り込んで導入（inbox を取り込める実行役だけ）
export async function applySkillInstalls(hub, cfg, opts = {}) {
  if (!outputsAllowedHere()) return { skipped: 'background-no-documents-access' };
  const { items } = await call(hub, 'GET', '/api/sync/pull?kinds=skill_install');
  const ack = [];
  for (const it of items) {
    try {
      const r = await installApproved(it, { hub, cfg, ...opts });
      if (r.done) ack.push(it.id);
    } catch (e) { log(`skill_install #${it.id} で例外: ${e.message}`); }
  }
  if (ack.length) await call(hub, 'POST', '/api/sync/ack', { ids: ack });
  return { installed: ack.length };
}
