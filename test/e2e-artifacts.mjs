// 成果物の配送 E2E（偽装した別マシン名 → hub → このマシン）。
//   CEREBRALOS_DIR=<tmp> CEREBRALOS_HUB_URL=http://localhost:8787 CEREBRALOS_HUB_TOKEN=<.dev.vars の HUB_SYNC_TOKEN> node test/e2e-artifacts.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import { call, loadHubConfig } from '../src/hub-client.js';
import { collectOutputs, uploadArtifacts, syncArtifacts, outputDirName, sha256File } from '../src/dispatch/artifacts.js';

let failed = 0;
const ok = (c, label, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`); if (!c) failed++; };
const hub = loadHubConfig();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-art-'));
const MINI_OUT = path.join(tmp, 'mini-outputs');
const MAC_OUT = path.join(tmp, 'macbook-outputs');
const stamp = Date.now();

// カード（偽装した別マシンが実行した想定）
const card = (await call(hub, 'POST', '/api/sync/board', { author: 'claude-code', text: `E2E 成果物配送 ${stamp}: 調べて`, lane: 'want' })).item;
const dirName = outputDirName(card);
ok(/^\d{4}-\d{2}-\d{2}-.+-[0-9a-f]{6}$/.test(dirName) || /^\d{4}-\d{2}-\d{2}-/.test(dirName), '成果物フォルダ名 <日付>-<slug>-<id短縮>', dirName);

// 1. mini-fake が成果物を作ってアップロード
process.env.CEREBRALOS_OUT_ROOT = MINI_OUT;
const work = path.join(tmp, 'work', card.id);
fs.mkdirSync(path.join(work, 'out', 'sub'), { recursive: true });
fs.writeFileSync(path.join(work, 'out', 'report.md'), '# レポート v1\n本文');
fs.writeFileSync(path.join(work, 'out', 'sub', 'data.csv'), 'a,b\n1,2\n');
fs.writeFileSync(path.join(work, 'out', 'big.bin'), Buffer.alloc(2048, 7));
fs.writeFileSync(path.join(work, 'task.md'), 'これは out/ の外なので送られない');
const files = collectOutputs(work, dirName, '## 要約\nテスト結果');
ok(files.map((f) => f.path).sort().join() === 'big.bin,report.md,result.md,sub/data.csv', '成果物は out/ と result.md だけ（task.md は含まない）', files.map((f) => f.path).join(','));
ok(files.every((f) => fs.existsSync(path.join(MINI_OUT, dirName, f.path))), 'mini 側の cerebralos-outputs/<dir>/ に配置');
const ups = await uploadArtifacts(hub, card.id, dirName, files, 'mini-fake', 1000); // 上限 1000B → big.bin は Mac にのみ保存
ok(ups.find((f) => f.path === 'report.md').stored && !ups.find((f) => f.path === 'big.bin').stored, 'アップロード: 上限超過は「Mac にのみ保存」として記録', ups.map((f) => `${f.path}:${f.stored}`).join(' '));

// 2. MacBook 側（別パス）で sync → 同じ相対パスへダウンロード、ハッシュ一致、通知
process.env.CEREBRALOS_OUT_ROOT = MAC_OUT;
let r = await syncArtifacts(hub, { machine: 'MacBook-test', quiet: true });
const mine = (p) => path.join(MAC_OUT, dirName, p);
ok(r.downloaded >= 3, 'sync: 自分に無い成果物をダウンロード', JSON.stringify(r));
ok(['report.md', 'result.md', 'sub/data.csv'].every((p) => fs.existsSync(mine(p)) && sha256File(mine(p)) === files.find((f) => f.path === p).sha256), 'ダウンロードしたファイルのハッシュが元と一致（サブフォルダも同じパス）');
ok(!fs.existsSync(mine('big.bin')), '「Mac にのみ保存」のファイルは配送されない');
const nlog = fs.readFileSync(path.join(process.env.CEREBRALOS_DIR, '.brain', 'notifications.log'), 'utf-8');
ok(/成果物が届きました: E2E 成果物配送/.test(nlog), 'macOS 通知（notifications.log にも記録）', nlog.trim().split('\n').pop());
r = await syncArtifacts(hub, { machine: 'MacBook-test', quiet: true });
ok(r.downloaded === 0 && r.conflicts === 0, '2 回目の sync は何もしない（冪等）');

// 3. 手元の同パスを退避した状態から sync → 再ダウンロード
fs.renameSync(mine('report.md'), mine('report.md.bak'));
r = await syncArtifacts(hub, { machine: 'MacBook-test', quiet: true });
ok(fs.existsSync(mine('report.md')) && sha256File(mine('report.md')) === sha256File(mine('report.md.bak')), '退避後の sync で同パスへ再ダウンロード（ハッシュ一致）');

// 4. 手元で編集 → 上書きしない
fs.writeFileSync(mine('report.md'), '# 手元で編集した版');
r = await syncArtifacts(hub, { machine: 'MacBook-test', quiet: true });
ok(fs.readFileSync(mine('report.md'), 'utf-8') === '# 手元で編集した版' && r.conflicts === 0, '受け取り後に手元で編集したファイルは上書きも conflict 化もしない');

// 5. mini が同じパスの新版を上げる → 手元と違うので .conflict-<machine> を並べる（既存は上書きしない）
process.env.CEREBRALOS_OUT_ROOT = MINI_OUT;
fs.writeFileSync(path.join(work, 'out', 'report.md'), '# レポート v2（mini の新版）');
const files2 = collectOutputs(work, dirName, '## 要約\nテスト結果');
await uploadArtifacts(hub, card.id, dirName, files2.filter((f) => f.path === 'report.md'), 'mini-fake', 1e6);
process.env.CEREBRALOS_OUT_ROOT = MAC_OUT;
r = await syncArtifacts(hub, { machine: 'MacBook-test', quiet: true });
ok(r.conflicts === 1, 'ハッシュ違いは conflict として配送', JSON.stringify(r));
ok(fs.readFileSync(mine('report.md'), 'utf-8') === '# 手元で編集した版', '既存ファイルは上書きされない');
ok(fs.existsSync(mine('report.md.conflict-mini-fake')) && fs.readFileSync(mine('report.md.conflict-mini-fake'), 'utf-8').includes('v2'), '.conflict-mini-fake が並ぶ');
r = await syncArtifacts(hub, { machine: 'MacBook-test', quiet: true });
ok(r.conflicts === 0 && r.downloaded === 0, 'conflict も 2 回目は増えない');

// 6. 自分が実行したもの（uploaded_by が自分）は通知しない
const before = fs.readFileSync(path.join(process.env.CEREBRALOS_DIR, '.brain', 'notifications.log'), 'utf-8').split('\n').length;
r = await syncArtifacts(hub, { machine: 'mini-fake', quiet: true });
const after = fs.readFileSync(path.join(process.env.CEREBRALOS_DIR, '.brain', 'notifications.log'), 'utf-8').split('\n').length;
ok(after === before, '自分が作った成果物では通知しない');

// 後片付け（自作テストデータ）
await call(hub, 'POST', '/api/sync/board', { author: 'claude-code', id: card.id, text: card.text, lane: 'done' });
fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `\n${failed} 件 FAIL` : '\n全て PASS');
process.exit(failed ? 1 : 0);
