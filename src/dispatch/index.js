// src/dispatch/index.js — `cerebralos dispatch <run|doctor|status|route|judge|jev-report>`
import { dispatchRun } from './run.js';
import { doctor } from './doctor.js';
import { routeTask } from './route.js';
import { judgeApproval } from './judge.js';
import { loadDispatchConfig } from './config.js';
import { jevReport } from './jev.js';

export async function dispatchCommand(action, text, options = {}) {
  try {
    if (action === 'run') {
      const r = await dispatchRun({ noExec: !!options.noExec, noJudge: !!options.noJudge });
      console.log(`[dispatch] ${JSON.stringify(r)}`);
    } else if (action === 'doctor') {
      const { ng } = await doctor({ deep: !!options.deep });
      if (ng) process.exitCode = 1;
    } else if (action === 'status') {
      console.log(JSON.stringify(loadDispatchConfig(), null, 2));
    } else if (action === 'route') {
      const r = await routeTask(String(text || ''));
      console.log(JSON.stringify({ route: r.route, confidence: Number(r.confidence.toFixed(3)), scores: r.scores }, null, 1));
    } else if (action === 'jev-report') {
      console.log(jevReport({ days: options.days || 7 }).text);
    } else if (action === 'judge') {
      console.log(JSON.stringify(await judgeApproval(String(text || ''))));
    } else {
      console.error('usage: cerebralos dispatch <run|doctor|status|route "<text>"|judge "<text>"|jev-report [--days N]>');
      process.exitCode = 2;
    }
  } catch (e) {
    console.error(`[dispatch] 失敗: ${e.message}`);
    process.exitCode = 1;
  }
}
