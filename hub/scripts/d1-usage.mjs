// hub/scripts/d1-usage.mjs — D1 の 1 日の読み取り行数（直近 24 時間）を確かめ、無料の枠（1 日 500 万行）に近づいたら知らせる。
//   node hub/scripts/d1-usage.mjs [--quiet]
//   中身は wrangler d1 insights（Cloudflare の分析。D1 が止められていても読める）。結果は ~/.cache/cerebralos/d1-usage.json
//   WARN（既定 300 万行＝枠の 60%）を超えたら、通知と tmux の画面下に出す（6 時間に 1 回まで）。ws-notify が 30 分ごとに呼ぶ
//   2026-10-23 無料の枠を使い切って hub が止まった対策
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HUB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(os.homedir(), '.cache', 'cerebralos', 'd1-usage.json');
const LIMIT = 5_000_000;
const WARN = Number(process.env.CEREBRALOS_D1_WARN_ROWS) || 3_000_000;

export function sumReads(rows) {
  return (Array.isArray(rows) ? rows : []).reduce((n, q) => n + (Number(q.totalRowsRead) || 0), 0);
}

function notify(title, body) {
  const q = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  spawnSync('osascript', ['-e', `display notification ${q(body)} with title ${q(title)} subtitle "CerebraLOS"`]);
  spawnSync('afplay', ['/System/Library/Sounds/Basso.aiff'], { timeout: 5000 });
  const tmux = spawnSync('tmux', ['list-clients', '-F', '#{client_tty}'], { encoding: 'utf8' });
  for (const c of String(tmux.stdout || '').split('\n').filter(Boolean)) spawnSync('tmux', ['display-message', '-c', c, '-d', '8000', `≋ ${title}: ${body}`]);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = spawnSync('npx', ['wrangler', 'd1', 'insights', 'cerebralos-hub', '--timePeriod', '1d', '--sort-by', 'reads', '--sort-direction', 'DESC', '--limit', '200', '--json'],
    { cwd: HUB, encoding: 'utf8', timeout: 120000 });
  let rows;
  try { rows = JSON.parse(r.stdout); } catch { console.error(`使用量を取れませんでした: ${String(r.stderr || '').slice(-200)}`); process.exit(1); }
  const reads = sumReads(rows);
  let prev = {};
  try { prev = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { /* 初回 */ }
  const top = rows.slice(0, 3).map((q) => ({ reads: q.totalRowsRead, runs: q.numberOfTimesRun, query: String(q.query || '').slice(0, 80) }));
  const now = Date.now();
  const out = { at: new Date(now).toISOString(), rows_read_24h: reads, limit: LIMIT, ratio: Math.round((reads / LIMIT) * 1000) / 10, top, alerted_at: prev.alerted_at || null };
  if (reads >= WARN && (!prev.alerted_at || now - Date.parse(prev.alerted_at) > 6 * 3600e3)) {
    notify('D1 の読み取りが多くなっています', `直近 24 時間で ${(reads / 1e4).toFixed(0)} 万行（無料の枠の ${out.ratio}%）。いちばん多いのは ${top[0] ? top[0].query.slice(0, 40) : '?'}`);
    out.alerted_at = out.at;
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  if (!process.argv.includes('--quiet')) console.log(`D1 の読み取り（直近 24 時間）: ${reads.toLocaleString()} 行（無料の枠の ${out.ratio}%）`);
}
