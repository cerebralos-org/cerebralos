// src/dispatch/skill-registry.js — 導入済みスキルの正本・台帳・各 AI へのリンク
//   正本   : <sharedRoot>/<name>/  （dotfiles/skills-shared。.skill-source.json に出典・commit・導入日・holders・risk）
//   台帳   : <sharedRoot>/REGISTRY.json  { version, skills: { <name>: { commit, source_repo, entry, holders, risk, installed_at, card, digest } } }
//   リンク : 各マシンの dispatch run が台帳を見て <homes[holder]>/<name> → 正本 のシンボリックリンクを張る/外す。
//            既存の同名（リンクでも実フォルダでも、別の場所を指すものでも）は絶対に上書きしない → state=exists_other（needs_attention）
//            holders から外れたら「自分が張ったリンクだけ」外す（正本は残す）。
//   パスはすべて引数で差し替え可（テストはダミーの sharedRoot / homes で行う）。
import fs from 'fs';
import path from 'path';
import { SKILL_HOLDERS } from './config.js';
import { listInstallFiles, contentDigest } from './skill-scan.js';

const NAME_RE = /^[a-z0-9][a-z0-9._-]{0,62}$/;
export const REGISTRY_FILE = 'REGISTRY.json';
export const SOURCE_FILE = '.skill-source.json';

export function readRegistry(sharedRoot) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(sharedRoot, REGISTRY_FILE), 'utf-8'));
    return { version: 1, skills: j && typeof j.skills === 'object' && j.skills ? j.skills : {} };
  } catch { return { version: 1, skills: {} }; }
}
export function writeRegistry(sharedRoot, reg) {
  fs.mkdirSync(sharedRoot, { recursive: true });
  const p = path.join(sharedRoot, REGISTRY_FILE);
  const tmp = `${p}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify({ version: 1, updated_at: new Date().toISOString(), skills: reg.skills }, null, 2) + '\n');
  fs.renameSync(tmp, p);
}

// 隔離フォルダの entry を正本へコピー。digest が承認時と違えば中止。同名で出典が違う正本があれば name_conflict
//   meta: { name, source_repo, commit, entry, holders, risk, card, digest, approved_by }
export function installSkillFiles(entryDir, sharedRoot, meta, { now = new Date() } = {}) {
  if (!NAME_RE.test(meta.name)) throw Object.assign(new Error('name が不正'), { code: 'bad_name' });
  const listed = listInstallFiles(entryDir);
  const digest = contentDigest(listed.files);
  if (meta.digest && digest !== meta.digest) throw Object.assign(new Error('内容の指紋が承認時と一致しません（取得物が変わった）'), { code: 'digest_mismatch' });
  const dest = path.join(sharedRoot, meta.name);
  if (fs.existsSync(dest)) {
    let prev = null;
    try { prev = JSON.parse(fs.readFileSync(path.join(dest, SOURCE_FILE), 'utf-8')); } catch { /* 出典不明 */ }
    if (!prev || prev.source_repo !== meta.source_repo)
      throw Object.assign(new Error(`正本に同名のスキル（${meta.name}）が既にあり、出典が異なる/不明のため上書きしません`), { code: 'name_conflict' });
  }
  fs.mkdirSync(sharedRoot, { recursive: true });
  const tmp = path.join(sharedRoot, `.${meta.name}.tmp-${process.pid}`);
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  for (const f of listed.files) {
    const t = path.join(tmp, f.rel);
    fs.mkdirSync(path.dirname(t), { recursive: true });
    fs.copyFileSync(f.abs, t);
    fs.chmodSync(t, f.mode & 0o111 ? 0o755 : 0o644);
  }
  fs.writeFileSync(path.join(tmp, SOURCE_FILE), JSON.stringify({
    name: meta.name, source_repo: meta.source_repo, commit: meta.commit, entry: meta.entry,
    installed_at: now.toISOString(), holders: meta.holders, risk: meta.risk, content_digest: digest,
    approved_by: meta.approved_by || 'yanagi', card: meta.card || null, excluded: listed.skipped.map((s) => s.path),
  }, null, 2) + '\n');
  fs.rmSync(dest, { recursive: true, force: true });
  fs.renameSync(tmp, dest);
  return { dest, digest, files: listed.files.length, excluded: listed.skipped };
}

export function registerSkill(sharedRoot, meta, now = new Date()) {
  const reg = readRegistry(sharedRoot);
  reg.skills[meta.name] = {
    commit: meta.commit, source_repo: meta.source_repo, entry: meta.entry, holders: [...meta.holders], risk: meta.risk,
    installed_at: (reg.skills[meta.name] && reg.skills[meta.name].installed_at) || now.toISOString(), updated_at: now.toISOString(),
    card: meta.card || null, digest: meta.digest || null, description: meta.description || '',
  };
  writeRegistry(sharedRoot, reg);
  return reg;
}

// holders を変える（正本は残す。リンクの付け外しは syncLinks が行う）
export function setHolders(sharedRoot, name, holders) {
  const reg = readRegistry(sharedRoot);
  if (!reg.skills[name]) throw new Error(`台帳に ${name} がありません`);
  reg.skills[name].holders = holders.filter((h) => SKILL_HOLDERS.includes(h));
  reg.skills[name].updated_at = new Date().toISOString();
  writeRegistry(sharedRoot, reg);
  return reg;
}

const lst = (p) => { try { return fs.lstatSync(p); } catch { return null; } };
const resolveLink = (p) => { try { return path.resolve(path.dirname(p), fs.readlinkSync(p)); } catch { return null; } };

// 台帳に従ってリンクを張る/外す。戻り値は {name, holder, state, path, note}[]
//   state: linked（張った/既に正しい）| unlinked（外した）| exists_other（同名が既にある → 触らない）| skipped_no_home（その AI の設定フォルダが無い）| error | none
//   homes: { claude: '<…>/.claude/skills', ... }  ※ その親（.claude 等）が無い AI は未導入とみなして飛ばす
export function syncLinks({ registry, sharedRoot, homes, dryRun = false }) {
  const out = [];
  for (const [name, s] of Object.entries(registry.skills || {})) {
    if (!NAME_RE.test(name)) continue;
    const source = path.join(sharedRoot, name);
    for (const holder of SKILL_HOLDERS) {
      const dir = homes[holder];
      if (!dir) continue;
      const link = path.join(dir, name);
      const want = (s.holders || []).includes(holder);
      const cur = lst(link);
      const rec = (state, note = '') => out.push({ name, holder, state, path: link, note });
      try {
        if (want) {
          if (!fs.existsSync(path.dirname(dir))) { rec('skipped_no_home', `${path.dirname(dir)} が無い（${holder} 未導入）`); continue; }
          if (!cur) {
            if (!fs.existsSync(source)) { rec('error', `正本 ${source} がまだ届いていません（同期待ち）`); continue; }
            if (!dryRun) { fs.mkdirSync(dir, { recursive: true }); fs.symlinkSync(source, link, 'dir'); }
            rec('linked', '新規にリンクを張った');
          } else if (cur.isSymbolicLink() && resolveLink(link) === path.resolve(source)) rec('linked', '');
          else rec('exists_other', cur.isSymbolicLink() ? `別の場所へのリンクが既にある（→ ${resolveLink(link)}）` : '同名のフォルダ/ファイルが既にある');
        } else if (cur && cur.isSymbolicLink() && resolveLink(link) === path.resolve(source)) {
          if (!dryRun) fs.unlinkSync(link);
          rec('unlinked', 'holders から外れたためリンクを外した（正本は残してある）');
        }
      } catch (e) { rec('error', e.message); }
    }
  }
  return out;
}

// 各 AI のスキル一覧（フォルダ名だけ。リンク先の中身には触れない）。managed = 正本へのリンク
export function inventory({ homes, sharedRoot }) {
  const inv = {};
  for (const holder of SKILL_HOLDERS) {
    const dir = homes[holder];
    inv[holder] = [];
    if (!dir) continue;
    let ents = [];
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      if (e.name.startsWith('.')) continue;
      const p = path.join(dir, e.name);
      const target = e.isSymbolicLink() ? resolveLink(p) : null;
      inv[holder].push({ name: e.name, kind: e.isSymbolicLink() ? 'link' : e.isDirectory() ? 'dir' : 'file', managed: !!(target && sharedRoot && target === path.resolve(sharedRoot, e.name)) });
    }
    inv[holder].sort((a, b) => (a.name < b.name ? -1 : 1));
  }
  return inv;
}
