// src/dispatch/worktree.js — 実装モードの git 操作（作業コピー・commit・検査・取り込み・破棄）
//
// 原則:
//   - 本体の作業ツリーには触れない。作業は ~/.cerebralos/worktrees/<cardId>（git worktree）、取り込みは一時の別 worktree で行う。
//   - push は「取り込み」の 1 か所だけ（HEAD:refs/heads/<base_branch>、通常 push のみ）。--force 系はこのモジュールのどこにも無く、gitPush が拒否する。
//   - 実装中のエージェントは commit しない。commit は実行役（ここ）が、秘密ファイルらしきものを除いて行う。
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { CEREBRALOS_DIR } from '../util.js';
import { childEnv, runProcess } from './exec.js';
import { expandHome } from './repos.js';

export const worktreeRoot = () => process.env.CEREBRALOS_WORKTREES || path.join(CEREBRALOS_DIR, 'worktrees');
export const CARD_DIR = '.cerebralos-card'; // 実行中だけ worktree に置く依頼・文脈（commit しない）
const NODE_LINKS = ['node_modules', 'hub/node_modules'];

// 秘密らしきファイルは commit しない（読み書きしない方針の最終防衛線）
export const SECRET_PATH_RE = /(^|\/)(\.env(\..*)?|\.npmrc|\.netrc|\.pgpass|id_(rsa|dsa|ecdsa|ed25519)(\.pub)?|credentials(\.json)?|auth\.json|secrets?\.(json|ya?ml|toml)|\.dev\.vars|[^/]*\.(pem|key|p12|pfx|keystore|jks)|\.ssh\/.*|\.aws\/.*|\.grok\/.*|\.codex\/.*)$/i;

function gitEnv() {
  return { ...childEnv(), GIT_TERMINAL_PROMPT: '0', GIT_SSH_COMMAND: 'ssh -o BatchMode=yes -o ConnectTimeout=20', GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C' };
}
export function git(cwd, args, { timeout = 60000, input } = {}) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf-8', env: gitEnv(), timeout, input, maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim(), raw: r.stdout || '' };
}
const must = (r, what) => { if (!r.ok) throw new Error(`${what}に失敗: ${(r.err || r.out).split('\n').slice(-3).join(' ').slice(0, 300)}`); return r; };

// push はここだけ。force 系・削除・refspec の + を拒否し、宛先は refs/heads/<branch> に固定する
export function gitPush(cwd, branch) {
  if (!/^[A-Za-z0-9._\/-]+$/.test(branch || '') || branch.startsWith('-')) throw new Error(`push 先のブランチ名が不正です: ${branch}`);
  const args = ['push', 'origin', `HEAD:refs/heads/${branch}`];
  if (args.some((a) => /^(-f|--force.*|--delete|-d|--mirror|--prune)$/.test(a) || a.startsWith('+'))) throw new Error('force / delete 系の push は禁止です');
  return git(cwd, args, { timeout: 120000 });
}

export function slugify(text) {
  return String(text || '').normalize('NFKC').toLowerCase().replace(/https?:\/\/\S+/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24).replace(/-+$/, '') || 'task';
}
const cardKey = (id) => String(id).replace(/^b-/, '').replace(/[^A-Za-z0-9]/g, '').slice(0, 6) || 'card';
export const branchName = (card) => `cerebralos/${cardKey(card.id)}-${slugify(card.text)}`;
const idOk = (id) => /^[A-Za-z0-9_-]{1,40}$/.test(String(id || ''));
export function worktreePath(cardId) {
  if (!idOk(cardId)) throw new Error('カード ID が不正です');
  return path.join(worktreeRoot(), cardId);
}
const insideRoot = (p) => { const r = path.resolve(worktreeRoot()); const a = path.resolve(p); return a !== r && a.startsWith(r + path.sep); };

// node_modules を読み取り用にリンク（コードが依存を解決できるように。サンドボックスの書き込み範囲外なので中身は変えられない）
export function linkNodeModules(repoPath, wt) {
  const linked = [];
  for (const rel of NODE_LINKS) {
    const src = path.join(repoPath, rel);
    const dst = path.join(wt, rel);
    try {
      if (fs.existsSync(src) && fs.existsSync(path.dirname(dst)) && !fs.existsSync(dst)) { fs.symlinkSync(src, dst, 'dir'); linked.push(rel); }
    } catch { /* 無くても動く */ }
  }
  return linked;
}

export const isWorktree = (wt) => fs.existsSync(wt) && git(wt, ['rev-parse', '--is-inside-work-tree']).out === 'true';

// 作業コピーを用意する（無ければ fetch → worktree add。あれば再利用＝修正依頼のとき）。戻り値 { wt, branch, baseRef, baseSha, reused }
export function ensureWorktree({ repo, card, log = () => {} }) {
  const repoPath = expandHome(repo.path);
  if (!fs.existsSync(path.join(repoPath, '.git'))) throw new Error(`リポジトリが見つかりません: ${repo.path}`);
  const wt = worktreePath(card.id);
  const branch = branchName(card);
  const baseRef = `origin/${repo.base_branch}`;
  must(git(repoPath, ['fetch', 'origin', '--prune'], { timeout: 180000 }), 'git fetch');
  const baseSha = must(git(repoPath, ['rev-parse', '--verify', `${baseRef}^{commit}`]), `${baseRef} の確認`).out;
  fs.mkdirSync(worktreeRoot(), { recursive: true });
  if (isWorktree(wt)) {
    const cur = git(wt, ['rev-parse', '--abbrev-ref', 'HEAD']).out;
    log(`作業コピーを再利用: ${wt} (${cur})`);
    linkNodeModules(repoPath, wt);
    return { wt, branch: cur, baseRef, baseSha, reused: true, repoPath };
  }
  if (fs.existsSync(wt)) fs.rmSync(wt, { recursive: true, force: true });
  git(repoPath, ['worktree', 'prune']);
  const exists = git(repoPath, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]).ok;
  must(exists ? git(repoPath, ['worktree', 'add', wt, branch]) : git(repoPath, ['worktree', 'add', wt, '-b', branch, baseRef]), 'git worktree add');
  linkNodeModules(repoPath, wt);
  log(`作業コピーを作成: ${wt} (${branch} ← ${baseRef} ${baseSha.slice(0, 8)})`);
  return { wt, branch, baseRef, baseSha, reused: false, repoPath };
}

// 実行後の検査: エージェントが push / 別ブランチ操作をしていないか。
// 作業ブランチの先頭（エージェントが commit していた場合）を含むリモート参照があれば違反
export function checkNoPush({ repoPath, wt, startSha }) {
  const head = git(wt, ['rev-parse', 'HEAD']).out;
  const problems = [];
  if (head && head !== startSha) {
    git(repoPath, ['fetch', 'origin', '--prune'], { timeout: 120000 });
    const r = git(repoPath, ['branch', '-r', '--contains', head]);
    const hit = r.out.split('\n').map((s) => s.trim()).filter((s) => s && !s.includes('->'));
    if (hit.length) problems.push(`作業ブランチの内容がリモートに存在します（${hit.slice(0, 3).join(', ')}）。エージェントが push した可能性があります`);
  }
  const br = git(wt, ['rev-parse', '--abbrev-ref', 'HEAD']).out;
  if (!br.startsWith('cerebralos/')) problems.push(`作業コピーのブランチが ${br} に切り替わっていました`);
  return problems;
}

// 変更を commit する。秘密らしきパス・リンクは除く。戻り値 { commit, files, blocked, empty }
export function commitAll({ wt, message, author }) {
  // exclude 付きの pathspec は、.gitignore に当たるリンクがあると rc=1 になるため、素直に add してから外す
  must(git(wt, ['add', '-A']), 'git add');
  for (const p of [...NODE_LINKS, CARD_DIR]) git(wt, ['rm', '-r', '-q', '--cached', '--ignore-unmatch', '--', p]);
  const raw = git(wt, ['diff', '--cached', '--raw', '-z', '--no-renames']).raw;
  const blocked = [];
  // -z の raw: ":<mode> <mode> <sha> <sha> <status>\0<path>\0"
  const parts = raw.split('\0').filter(Boolean);
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const meta = parts[i].split(/\s+/);
    const file = parts[i + 1];
    const isLink = meta[1] === '120000' || meta[0] === ':120000';
    if (SECRET_PATH_RE.test(file) || isLink) { git(wt, ['reset', '-q', '--', file]); blocked.push(file); }
  }
  const files = git(wt, ['diff', '--cached', '--name-only']).out.split('\n').filter(Boolean);
  if (!files.length) return { commit: null, files: [], blocked, empty: true };
  const cfg = (k) => git(wt, ['config', k]).out;
  const id = ['-c', `user.name=${cfg('user.name') || 'CerebraLOS dispatch'}`, '-c', `user.email=${cfg('user.email') || 'cerebralos@localhost'}`, '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false'];
  must(git(wt, [...id, 'commit', '-q', '--no-verify', '-m', message]), 'git commit');
  return { commit: git(wt, ['rev-parse', 'HEAD']).out, files, blocked, empty: false };
}

export function diffInfo(wt, baseRef) {
  const range = `${baseRef}...HEAD`;
  return {
    stat: git(wt, ['diff', '--stat=100', range]).out,
    names: git(wt, ['diff', '--name-only', range]).out.split('\n').filter(Boolean),
    patch: git(wt, ['diff', '--binary', range]).raw,
    shortstat: git(wt, ['diff', '--shortstat', range]).out,
  };
}

export const deployNote = (repo, names) => {
  const hits = (repo.deploy_hints || []).filter((h) => names.some((n) => n.startsWith(h.path_prefix)));
  return hits.length ? `デプロイが必要: ${hits.map((h) => h.cmd).join(' / ')}` : '';
};

// テスト実行（非同期。リース延長のタイマーを止めない）。環境変数は CEREBRALOS_* と API キーを除いた通常環境
export async function runTests(cwd, cmd, { timeoutMs = 10 * 60 * 1000 } = {}) {
  if (!cmd) return { ran: false, ok: null, summary: 'テストコマンドが未設定のため実行していません' };
  const r = await runProcess({ cmd: '/bin/sh', args: ['-c', cmd], cwd, timeoutMs });
  const text = `${r.output}\n${r.error}`;
  const nums = ['tests', 'pass', 'fail'].map((k) => { const m = text.match(new RegExp(`^[#ℹ]\\s*${k}\\s+(\\d+)`, 'm')); return m ? `${k} ${m[1]}` : null; }).filter(Boolean);
  const tail = text.trim().split('\n').slice(-6).join('\n').slice(-500);
  return { ran: true, ok: r.ok, timedOut: r.timedOut, code: r.code, cmd, summary: r.timedOut ? 'タイムアウト' : nums.length ? nums.join(' / ') : tail };
}

// worktree とブランチを消す（作業コピー・取り込み用の一時コピー共通）
export function removeWorktree({ repoPath, wt, branch }) {
  if (!insideRoot(wt)) throw new Error(`worktree の場所が範囲外です: ${wt}`);
  const r = git(repoPath, ['worktree', 'remove', '--force', wt]);
  if (!r.ok && fs.existsSync(wt)) fs.rmSync(wt, { recursive: true, force: true });
  git(repoPath, ['worktree', 'prune']);
  let branchDeleted = false;
  if (branch && branch.startsWith('cerebralos/')) branchDeleted = git(repoPath, ['branch', '-D', branch]).ok;
  return { removed: !fs.existsSync(wt), branchDeleted };
}

// 取り込み: 一時 worktree で base に merge → テスト → 通常 push。成功したら作業コピーとブランチを消す。
// 戻り値 { outcome: merged|conflict|test_failed|push_failed|error, result, ... }
export async function mergeToBase({ repo, cardId, branch, log = () => {}, tests = runTests }) {
  const repoPath = expandHome(repo.path);
  const base = repo.base_branch;
  const cardWt = worktreePath(cardId);
  const tmp = path.join(worktreeRoot(), `${cardId}-merge`);
  const cleanupTmp = () => { try { removeWorktree({ repoPath, wt: tmp }); } catch { /* ok */ } };
  try {
    if (!branch || !git(repoPath, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]).ok) {
      return { outcome: 'error', result: `ブランチ ${branch || '?'} が見つかりません（取り込み済みか破棄済みの可能性）。` };
    }
    const f = git(repoPath, ['fetch', 'origin', '--prune'], { timeout: 180000 });
    if (!f.ok) return { outcome: 'error', result: `git fetch に失敗しました: ${f.err.slice(-200)}` };
    cleanupTmp();
    must(git(repoPath, ['worktree', 'add', '--detach', tmp, `origin/${base}`]), '取り込み用 worktree の作成');
    linkNodeModules(repoPath, tmp);
    const before = git(tmp, ['rev-parse', 'HEAD']).out;
    let how = 'fast-forward';
    if (!git(tmp, ['merge', '--ff-only', branch]).ok) {
      how = 'merge commit';
      const m = git(tmp, ['-c', 'user.name=CerebraLOS dispatch', '-c', 'user.email=cerebralos@localhost', '-c', 'core.hooksPath=/dev/null', 'merge', '--no-ff', '-m', `Merge ${branch} (CerebraLOS card ${cardId})`, branch]);
      if (!m.ok) {
        const conflicts = git(tmp, ['diff', '--name-only', '--diff-filter=U']).out.split('\n').filter(Boolean);
        git(tmp, ['merge', '--abort']);
        cleanupTmp();
        return { outcome: 'conflict', result: `衝突したため取り込みを中止しました（base は変更していません）。衝突: ${conflicts.slice(0, 8).join(', ') || m.err.slice(-200)}。「修正を依頼」で衝突の解消を頼めます。`, conflicts };
      }
    }
    const after = git(tmp, ['rev-parse', 'HEAD']).out;
    const t = await tests(tmp, repo.test_cmd);
    if (t.ran && !t.ok) {
      cleanupTmp();
      return { outcome: 'test_failed', result: `取り込み後のテストが失敗したため push していません（${t.summary}）。`, tests: t };
    }
    if (after !== before) {
      const p = gitPush(tmp, base);
      if (!p.ok) {
        cleanupTmp();
        return { outcome: 'push_failed', result: `push できませんでした（リモートが先に進んだ可能性。もう一度取り込むと最新を取り直します）: ${(p.err || p.out).split('\n').slice(-2).join(' ').slice(0, 250)}`, tests: t };
      }
    }
    cleanupTmp();
    git(repoPath, ['fetch', 'origin', '--prune'], { timeout: 120000 });
    let cleaned = { removed: false, branchDeleted: false };
    try { cleaned = removeWorktree({ repoPath, wt: cardWt, branch }); } catch (e) { log(`作業コピーの削除に失敗: ${e.message}`); }
    const note = after === before ? '既に base に含まれていました（push なし）' : `origin/${base} に ${how} で push しました（${after.slice(0, 8)}）`;
    return { outcome: 'merged', result: `${note}。テスト: ${t.ran ? t.summary : '未設定'}。作業コピーとブランチは削除しました。`, tests: t, commit: after, how, cleaned };
  } catch (e) {
    cleanupTmp();
    return { outcome: 'error', result: `取り込み中にエラー: ${String(e.message).slice(0, 300)}` };
  }
}

export function discardWork({ repo, cardId, branch }) {
  const repoPath = expandHome(repo.path);
  const r = removeWorktree({ repoPath, wt: worktreePath(cardId), branch });
  return { outcome: 'discarded', result: `作業コピー${r.removed ? 'を削除' : 'の削除に失敗'}、ブランチ${r.branchDeleted ? 'を削除' : 'は残っています（無いか削除に失敗）'}しました。`, ...r };
}
