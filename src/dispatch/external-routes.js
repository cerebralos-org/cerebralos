// src/dispatch/external-routes.js — 外部の常駐 AI が MCP で拾う担当の一覧（純粋。Mac の dispatch と hub Worker の両方が import する）
// これらの担当のカードは Mac の dispatch では実行しない。承認済み（または自動OK）になると「<担当>待ち」の状態で止まり、
// その担当の AI が hub の /mcp（OAuth）で my_tasks → board_post(id, result) / task_artifact_put で受け取り・完了する。
//   chatgpt  : ChatGPT（Space・クラウド PC・画像・Forum 等）
//   grok_bot : xAI の Grok Bot（クラウドの PC とブラウザを持つ 24 時間の常駐エージェント。デスクトップ・スマホ共通）
export const EXTERNAL_ROUTES = ['chatgpt', 'grok_bot'];
export const WAITING_STATUS = { chatgpt: 'chatgpt_waiting', grok_bot: 'grok_bot_waiting' };
export const WAITING_STATUSES = EXTERNAL_ROUTES.map((r) => WAITING_STATUS[r]);
export const isExternalRoute = (r) => EXTERNAL_ROUTES.includes(r);
// 「いま」掲示板などでの名乗り（agent）
export const EXTERNAL_AGENT = { chatgpt: 'chatgpt', grok_bot: 'grok-bot' };
// my_tasks で受け取ったタスクのリース（この間はほかの呼び出しに同じタスクを返さない）
export const EXTERNAL_LEASE_MIN = 120;
