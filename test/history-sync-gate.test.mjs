// node --test test/history-sync-gate.test.mjs
// computer-history の hub 同期は「computer_history: true かつフォルダあり」の 1 台だけ（reconcile で他機の分を消さないため）
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chgate-'));
const hist = path.join(root, 'resources');
fs.mkdirSync(hist);
fs.mkdirSync(path.join(root, '.cerebralos', '.brain'), { recursive: true });
process.env.HOME = root; // CEREBRALOS_DIR は HOME 基準
const { historySyncEnabled } = await import('../src/computer-history.js');
const { brainPath } = await import('../src/hub-client.js');
const setCfg = (o) => fs.writeFileSync(brainPath('dispatch.json'), JSON.stringify(o));
const prev = process.env.CEREBRALOS_COMPUTER_HISTORY_DIR;

test('フラグ無し・false は送らない', () => {
  process.env.CEREBRALOS_COMPUTER_HISTORY_DIR = hist;
  setCfg({ machine: 'x' });
  assert.equal(historySyncEnabled(), false);
  setCfg({ computer_history: false });
  assert.equal(historySyncEnabled(), false);
});
test('true でもフォルダが無ければ送らない', () => {
  process.env.CEREBRALOS_COMPUTER_HISTORY_DIR = path.join(root, 'nope');
  setCfg({ computer_history: true });
  assert.equal(historySyncEnabled(), false);
});
test('true かつフォルダあり、で送る。env 0 が最優先', () => {
  process.env.CEREBRALOS_COMPUTER_HISTORY_DIR = hist;
  setCfg({ computer_history: true });
  assert.equal(historySyncEnabled(), true);
  process.env.CEREBRALOS_COMPUTER_HISTORY_SYNC = '0';
  assert.equal(historySyncEnabled(), false);
  delete process.env.CEREBRALOS_COMPUTER_HISTORY_SYNC;
  if (prev === undefined) delete process.env.CEREBRALOS_COMPUTER_HISTORY_DIR;
});
