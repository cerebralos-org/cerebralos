// src/dispatch/skill-scan.js — 隔離した外部スキルの静的検査（読むだけ。中のスクリプトは実行しない）
//   スクリプト一覧 / バイナリの有無 / curl|sh・rm -rf・ネットワーク送信・環境変数・キーチェーン・~/.ssh・認証ファイル参照 / 難読化 /
//   SKILL.md 等のプロンプトインジェクション的文言。結果は findings（severity: high|medium|info）と risk（low|medium|high）。
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { SKILL_LIMITS } from './config.js';

export const EXCLUDE_DIRS = new Set(['.git', '.claude', '.codex', '.grok', '.github', '.cursor', '.vscode', 'node_modules', '__pycache__']);
export const EXCLUDE_FILES = new Set(['.DS_Store', '.mcp.json', '.cursorrules']);
const SCRIPT_EXT = new Set(['sh', 'bash', 'zsh', 'py', 'js', 'mjs', 'cjs', 'ts', 'rb', 'pl', 'php', 'ps1', 'bat', 'cmd', 'lua', 'swift', 'applescript', 'scpt', 'command']);
const BENIGN_BIN_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'pdf', 'woff', 'woff2', 'ttf', 'otf']);
const AGENT_CONFIG_NAMES = /^(CLAUDE\.md|AGENTS\.md|GEMINI\.md|\.mcp\.json|\.cursorrules|settings\.json|settings\.local\.json)$/i;

const ext = (p) => (path.extname(p).slice(1) || '').toLowerCase();
export const sha256Buf = (b) => crypto.createHash('sha256').update(b).digest('hex');

// 導入対象のファイル一覧（symlink・除外ディレクトリは含めない）。skipped に除外したものを記録
export function listInstallFiles(entryDir) {
  const files = [], skipped = [];
  let total = 0;
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      const abs = path.join(dir, e.name);
      if (e.isSymbolicLink()) { skipped.push({ path: r, reason: 'symlink' }); continue; }
      if (e.isDirectory()) {
        if (EXCLUDE_DIRS.has(e.name)) { skipped.push({ path: r + '/', reason: 'excluded-dir' }); continue; }
        walk(abs, r);
      } else if (e.isFile()) {
        if (EXCLUDE_FILES.has(e.name)) { skipped.push({ path: r, reason: 'excluded-file' }); continue; }
        const st = fs.lstatSync(abs);
        total += st.size;
        if (total > SKILL_LIMITS.maxBytes) throw new Error('導入対象のサイズが上限（20MB）を超えています');
        files.push({ rel: r, abs, size: st.size, mode: st.mode });
      }
    }
  };
  walk(entryDir, '');
  return { files, skipped, total };
}

// 内容の指紋（パスと sha256 の一覧から）。承認したものと導入するものが同一かの確認に使う
export function contentDigest(files) {
  const h = crypto.createHash('sha256');
  for (const f of files) h.update(`${f.rel}\0${sha256Buf(fs.readFileSync(f.abs))}\n`);
  return h.digest('hex');
}

const isBinary = (buf) => buf.subarray(0, 8192).includes(0);
const magicExec = (buf) => {
  const b = buf.subarray(0, 4);
  const hex = b.toString('hex');
  return hex === '7f454c46' || ['feedface', 'feedfacf', 'cefaedfe', 'cffaedfe', 'cafebabe'].includes(hex) || (b[0] === 0x4d && b[1] === 0x5a); // ELF / Mach-O / fat / PE
};

// [id, severity, 説明, 正規表現, 対象('script'|'all'|'skillmd'|'doc')]
const PATTERNS = [
  ['pipe-to-shell', 'high', 'ダウンロードしたものをそのままシェルに渡す（curl|sh 等）', /\b(curl|wget)\b[^\n|]*\|\s*(sudo\s+)?(ba|z|da)?sh\b/i, 'all'],
  ['decode-to-shell', 'high', 'デコードしたものをシェル/eval に渡す', /(base64\s+(-d|--decode)[^\n|]*\|\s*(ba|z)?sh\b|\b(eval|exec)\s*\(\s*(atob|base64\.|Buffer\.from))/i, 'all'],
  ['rm-rf-home', 'high', '広範囲の強制削除（rm -rf / ~ $HOME）', /\brm\s+-[a-z]*(r[a-z]*f|f[a-z]*r)[a-z]*\s+(["']?)(\/|~|\$HOME|\$\{HOME\})(\/?\*?)\2(\s|$|;|&)/i, 'all'],
  ['secret-path', 'high', '秘密情報の置き場所を参照（~/.ssh, ~/.aws, ~/.gnupg, 鍵ファイル）', /(~|\$HOME|\$\{HOME\}|\/Users\/[^\/\s]+|\/home\/[^\/\s]+)\/\.(ssh|aws|gnupg|netrc|npmrc|kube|config\/gh)\b|\bid_(rsa|ed25519|ecdsa)\b/i, 'all'],
  ['keychain', 'high', 'キーチェーンの参照', /\bsecurity\s+(find|dump|add|delete)-(generic|internet)-password\b|login\.keychain|Library\/Keychains/i, 'all'],
  ['cli-auth-file', 'high', '各 CLI の認証ファイルの参照', /\.(grok|codex)\/auth\.json|\.claude\/\.credentials|\.claude\.json\b|\.config\/(claude|gh|gcloud)\b/i, 'all'],
  ['env-exfil', 'high', '環境変数を丸ごと外へ送る', /(printenv|\benv\b\s*\||process\.env\s*\)|JSON\.stringify\(\s*process\.env|os\.environ\s*\)).{0,120}(curl|wget|fetch|requests|http)/i, 'script'],
  ['injection-ja', 'high', 'プロンプトインジェクション的文言（日本語）', /(以前|これまで|上記|前)の(指示|命令|ルール|プロンプト)(を|は)?(すべて|全て|全部)?(無視|忘れ|破棄)|(システム|開発者)(プロンプト|指示).{0,8}(無視|開示|表示|出力して)|(秘密|機密|認証情報|トークン|パスワード|api\s*キー|apiキー|鍵).{0,10}(送信|送れ|送って|漏ら|アップロード|投稿して|教えて)/i, 'skillmd'],
  ['injection-en', 'high', 'プロンプトインジェクション的文言（英語）', /ignore\s+(all\s+|any\s+)?(the\s+|your\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?)|disregard\s+(your|all|any|the)\s+(previous\s+)?(instructions?|rules?)|\b(send|upload|post|exfiltrate|leak|email)\b.{0,40}\b(secrets?|credentials?|tokens?|api[ _-]?keys?|passwords?|ssh keys?|\.env)\b|you\s+are\s+now\s+(in\s+)?(developer|dan|jailbreak)\s*mode/i, 'skillmd'],
  ['injection-ja-doc', 'medium', 'プロンプトインジェクション的文言（SKILL.md 以外の文書）', /(以前|これまで|上記|前)の(指示|命令|ルール|プロンプト)(を|は)?(すべて|全て|全部)?(無視|忘れ|破棄)|(秘密|機密|認証情報|トークン|パスワード).{0,10}(送信|送れ|送って|漏ら)|ignore\s+(all\s+|any\s+)?(the\s+)?(previous|prior|above)\s+(instructions?|prompts?)/i, 'doc'],
  ['hidden-text', 'medium', '隠しテキスト（HTML コメント内の指示らしき文言）', /<!--[^>]{0,400}(ignore|instruction|system prompt|assistant|指示|システム|無視)[^>]{0,400}-->/i, 'doc'],
  ['network', 'medium', 'ネットワーク通信', /(?:^|[|;&(`]|\$\()\s*(?:sudo\s+)?(?:curl|wget|nc|ncat|socat|scp|sftp|rsync)\s+\S|\bfetch\s*\(|XMLHttpRequest|\baxios\b|\brequests\.(get|post|put)|\burllib|http\.client|\burlopen\b|net\.connect|new\s+WebSocket|\baiohttp\b|\bhttpx\b|\bInvoke-WebRequest\b/i, 'script'],
  ['env-read', 'medium', '環境変数・秘密らしき変数の参照', /process\.env|os\.environ|os\.getenv|\$\{?[A-Z0-9_]*(API_?KEY|TOKEN|SECRET|PASSWORD|PASSWD)[A-Z0-9_]*\}?/, 'script'],
  ['exec', 'medium', '別プロセスの起動・動的実行', /child_process|\bsubprocess\b|os\.system|\bpopen\b|\bexecSync\b|\bspawnSync\b|\beval\s*\(|\bnew\s+Function\s*\(|Runtime\.getRuntime/, 'script'],
  ['privilege', 'medium', '権限の変更・昇格', /\bsudo\b|\bchmod\s+(-R\s+)?[0-7]*7[0-7]{1,2}\b|\bchown\b|\bdoas\b/, 'script'],
  ['persist', 'medium', '常駐・シェル設定の書き換え', /LaunchAgents|launchctl|crontab|\.zshrc|\.bashrc|\.bash_profile|\.zprofile|\/etc\/(hosts|sudoers|profile)/, 'script'],
  ['obfuscation-b64', 'medium', '難読化の疑い（長い Base64 様の文字列）', /[A-Za-z0-9+\/]{300,}={0,2}/, 'script'],
  ['obfuscation-hex', 'medium', '難読化の疑い（\\x / charCode の連続）', /(\\x[0-9a-f]{2}){12,}|String\.fromCharCode\((\s*\d+\s*,){7,}|\batob\s*\(/i, 'script'],
  ['pkg-install-hook', 'medium', 'npm のインストール時スクリプト', /"(preinstall|postinstall|install|prepare)"\s*:/, 'package'],
];

const clip = (s, n) => String(s).replace(/\s+/g, ' ').trim().slice(0, n);
const redact = (s) => s.replace(/(sk-[A-Za-z0-9_-]{10,}|ghp_[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,})/g, '[伏せ字]');

// entryDir を検査。files はすでに listInstallFiles した結果を渡してもよい
export function scanSkill(entryDir, { listed } = {}) {
  const lf = listed || listInstallFiles(entryDir);
  const findings = [], scripts = [], binaries = [], docs = [];
  const add = (severity, id, file, line, message, excerpt) => findings.push({ severity, id, file, line: line || 0, message, excerpt: excerpt ? redact(clip(excerpt, 160)) : '' });
  const counts = {};
  for (const f of lf.files) {
    const buf = fs.readFileSync(f.abs);
    const e = ext(f.rel);
    const base = path.basename(f.rel);
    if (AGENT_CONFIG_NAMES.test(base) && f.rel !== 'SKILL.md') add('medium', 'agent-config', f.rel, 0, 'エージェント設定ファイルが同梱されている（読み込まれると挙動を変えうる）', base);
    if (isBinary(buf)) {
      if (magicExec(buf)) { binaries.push(f.rel); add('high', 'binary-exec', f.rel, 0, '実行ファイル（ELF/Mach-O/PE）が含まれている。静的に確認できない', base); }
      else if (BENIGN_BIN_EXT.has(e)) { binaries.push(f.rel); }
      else { binaries.push(f.rel); add('high', 'binary', f.rel, 0, '中身を確認できないバイナリが含まれている', `${base} (${f.size}B)`); }
      continue;
    }
    const text = buf.toString('utf-8');
    const first = text.slice(0, 200);
    const shebang = /^#!/.test(first);
    const isScript = SCRIPT_EXT.has(e) || shebang || (f.mode & 0o111) !== 0;
    if (isScript) scripts.push(f.rel);
    const isSkillMd = f.rel === 'SKILL.md';
    const isDoc = ['md', 'txt', 'mdx', 'rst', 'yaml', 'yml'].includes(e) || !e;
    const isPkg = base === 'package.json';
    if (isDoc) docs.push(f.rel);
    if (isDoc && (text.match(/[​-‏⁠﻿]/g) || []).length >= 3) add('medium', 'zero-width', f.rel, 0, 'ゼロ幅文字が複数ある（隠しテキストの疑い）', '');
    if (isScript && text.length > 2000 && text.split('\n').reduce((m, l) => Math.max(m, l.length), 0) > 1500) add('medium', 'minified', f.rel, 0, '1 行が極端に長い（ミニファイ/難読化の疑い）', '');
    const lines = text.split('\n');
    for (const [id, sev, msg, re, target] of PATTERNS) {
      const applies = target === 'all' || (target === 'script' && isScript) || (target === 'skillmd' && isSkillMd) ||
        (target === 'doc' && isDoc && !isSkillMd) || (target === 'package' && isPkg);
      if (!applies) continue;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].length > 4000 && target !== 'script') continue;
        if (re.test(lines[i])) {
          const k = `${id}:${f.rel}`;
          counts[k] = (counts[k] || 0) + 1;
          if (counts[k] <= 3) add(sev, id, f.rel, i + 1, msg, lines[i]);
        }
      }
    }
    // 秘密を読む + 外へ送る を同じスクリプトで両方している
    if (isScript && /process\.env|os\.environ|os\.getenv|\.env\b/.test(text) && /\b(curl|wget)\b|\bfetch\s*\(|requests\.(post|put)|urlopen|http\.client/.test(text))
      add('high', 'read-and-send', f.rel, 0, '環境変数/秘密を読み、かつネットワーク送信も行うスクリプト', base);
  }
  if (scripts.length) add('info', 'scripts', scripts.join(', ').slice(0, 300), 0, `スクリプトが ${scripts.length} 個ある（AI が実行しうる）`, '');
  const risk = findings.some((f) => f.severity === 'high') ? 'high' : findings.some((f) => f.severity === 'medium') ? 'medium' : 'low';
  return {
    risk,
    files: lf.files.map((f) => ({ path: f.rel, size: f.size })),
    skipped: lf.skipped,
    scripts, binaries,
    findings: findings.slice(0, 80),
    totals: { files: lf.files.length, bytes: lf.total, high: findings.filter((f) => f.severity === 'high').length, medium: findings.filter((f) => f.severity === 'medium').length },
    digest: contentDigest(lf.files),
  };
}

// 取得時の構造（symlink / submodule / LFS）を findings に足す
export function structureFindings(tree, repoDir) {
  const out = [];
  for (const t of tree || []) {
    if (t.mode === '120000') out.push({ severity: 'medium', id: 'symlink', file: t.path, line: 0, message: 'リポジトリに symlink がある（取得時は無効化済み・導入時は除外）', excerpt: '' });
    else if (t.mode === '160000') out.push({ severity: 'medium', id: 'submodule', file: t.path, line: 0, message: 'サブモジュールがある（取得しない）', excerpt: '' });
  }
  try {
    const ga = path.join(repoDir, '.gitattributes');
    if (fs.existsSync(ga) && /filter=lfs/.test(fs.readFileSync(ga, 'utf-8'))) out.push({ severity: 'medium', id: 'lfs', file: '.gitattributes', line: 0, message: 'Git LFS を使っている（LFS は取得しない。実体が無い可能性）', excerpt: '' });
  } catch { /* 無ければ無し */ }
  return out.slice(0, 20);
}

export const maxRisk = (...rs) => (rs.includes('high') ? 'high' : rs.includes('medium') ? 'medium' : 'low');
