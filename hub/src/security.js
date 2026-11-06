// 能動的なセキュリティ対策の「更新の指令」（docs.security_orders）。
//   見張り（常駐の計算役の src/security/scan.js）が、脆弱性の情報と各 PC の持ち物を照らし合わせて指令を足す（op=add）
//   各 PC の更新係（src/security/update.js）が自分あての指令を受け取り、更新して結果を書き込む（op=status）
//   指令: { id, at, target: <PC の名前> | 'all', kind: brew | npm | pip | node | app | manual, subject, to?, reason, severity, refs[], status, results{<PC>: {status, at, note}} }
//   同じ指令（target・kind・subject・to が同じ）は 2 回足さない。終わった指令は 14 日で消す
import { loadDoc, saveDoc } from './navi.js';

export const ORDER_KINDS = ['brew', 'npm', 'pip', 'node', 'app', 'manual'];
export const ORDER_STATUS = ['pending', 'done', 'failed', 'needs_human', 'skipped'];
const SEVERITY = ['critical', 'high', 'moderate', 'low', 'unknown'];
const clip = (v, n) => String(v ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').slice(0, n);
const nameOk = (v) => typeof v === 'string' && /^[A-Za-z0-9._@/+:-]{1,200}$/.test(v);  // PC の名前など
// 指令の対象（パッケージ名・フォルダの場所）。日本語のフォルダ名もあるので、改行・制御文字が無ければ受け付ける
const subjectOk = (v) => typeof v === 'string' && v.length >= 1 && v.length <= 300 && !/[\u0000-\u001f\u007f]/.test(v);

function prune(orders) {
  const floor = Date.now() - 14 * 86400e3;
  return orders.filter((o) => o.status === 'pending' || Date.parse(o.at) >= floor).slice(-500);
}

export function applySecurityOp(doc, b, HttpError) {
  const orders = Array.isArray(doc && doc.orders) ? doc.orders : [];
  if (b.op === 'add') {
    const list = Array.isArray(b.orders) ? b.orders.slice(0, 100) : [];
    let added = 0;
    for (const o of list) {
      if (!ORDER_KINDS.includes(o.kind)) throw new HttpError(400, `kind は ${ORDER_KINDS.join(' / ')} のどれかです`);
      if (!nameOk(o.target) || !subjectOk(o.subject)) throw new HttpError(400, 'target と subject が不正です');
      const key = [o.target, o.kind, o.subject, o.to || ''].join('|');
      // 同じ指令が済んでいない・済んだ・オーナーに回して 7 日以内なら足さない（毎日の見張りが同じものを出し直さない）
      const recent = (x) => Date.now() - Date.parse(x.at) < 7 * 86400e3;
      if (orders.some((x) => x.key === key && (x.status === 'pending' || x.status === 'done' || (['needs_human', 'failed'].includes(x.status) && recent(x))))) continue;
      orders.push({
        id: `so-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, key, at: new Date().toISOString(),
        target: o.target, kind: o.kind, subject: o.subject, to: o.to ? clip(o.to, 60) : null, reason: clip(o.reason, 500),
        severity: SEVERITY.includes(o.severity) ? o.severity : 'unknown', refs: (Array.isArray(o.refs) ? o.refs : []).slice(0, 10).map((r) => clip(r, 200)),
        status: 'pending', results: {},
      });
      added++;
    }
    return { doc: { orders: prune(orders) }, added };
  }
  if (b.op === 'status') {
    const o = orders.find((x) => x.id === b.id);
    if (!o) throw new HttpError(404, 'order not found');
    if (!ORDER_STATUS.includes(b.status)) throw new HttpError(400, `status は ${ORDER_STATUS.join(' / ')} のどれかです`);
    if (!nameOk(b.machine)) throw new HttpError(400, 'machine が不正です');
    o.results[b.machine] = { status: b.status, at: new Date().toISOString(), note: clip(b.note, 1000) };
    // 1 台あての指令はその結果が全体の状態。all あては、どれかが needs_human/failed ならそれ、全部終われば done
    if (o.target !== 'all') o.status = b.status;
    else {
      const st = Object.values(o.results).map((r) => r.status);
      o.status = st.includes('failed') ? 'failed' : st.includes('needs_human') ? 'needs_human' : 'pending';
      if (b.all_done) o.status = 'done';
    }
    return { doc: { orders: prune(orders) }, order: o };
  }
  throw new HttpError(400, 'op は add か status です');
}

export async function securityOp(env, b, HttpError) {
  const r = applySecurityOp(await loadDoc(env, 'security_orders'), b || {}, HttpError);
  await saveDoc(env, 'security_orders', r.doc, 'security');
  return { ok: true, added: r.added, order: r.order };
}

export async function securityOrders(env, machine) {
  const doc = await loadDoc(env, 'security_orders');
  const orders = Array.isArray(doc && doc.orders) ? doc.orders : [];
  return { orders: machine ? orders.filter((o) => o.status === 'pending' && (o.target === machine || o.target === 'all') && !(o.results || {})[machine]) : orders };
}
