// 外部スキル導入フロー（Worker 側）。状態遷移はここだけが行う:
//   propose（bearer・Mac）  : 調べ終えた acquire カード → 隔離・検査・レビュー・配属案つきの「導入提案」。カードは skill_proposal で承認待ち
//   approve（Access JWT の本人のみ） : 配属を確定して inbox kind=skill_install を積む（Mac が取り込んで導入）。risk=high は不可
//   reject（Access JWT の本人のみ）  : 却下
//   installed（bearer・Mac）: 導入結果（installed / needs_attention / failed）をカードに反映
//   report（bearer・Mac）   : 各マシンの「誰が何を持っているか」とリンク状態、台帳のミラー
// 承認は必ず本人の画面操作から。bearer（Mac）は承認も risk の引き下げもできない。
export const HOLDERS = ['claude', 'codex', 'grok'];
const NAME_RE = /^[a-z0-9][a-z0-9._-]{0,62}$/;
const RISKS = ['low', 'medium', 'high'];

export function createSkills({ HttpError, readJson, now, DISPATCH_COLS }) {
  const clip = (s, n) => (s == null ? '' : String(s).slice(0, n));
  const jparse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
  const idOk = (v) => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v) ? v : null);
  const machineOk = (v) => (typeof v === 'string' && /^[A-Za-z0-9_.-]{1,40}$/.test(v) ? v : null);
  const holdersOf = (v) => (Array.isArray(v) ? [...new Set(v.filter((h) => HOLDERS.includes(h)))] : []);

  // ---- Mac → hub: 導入提案 ----
  async function propose(env, request) {
    const b = await readJson(request, 64 * 1024);
    const card = idOk(b.card);
    const machine = machineOk(b.machine);
    const p = b.proposal;
    if (!card || !machine || !p || typeof p !== 'object') throw new HttpError(400, 'bad params');
    if (!NAME_RE.test(String(p.name || ''))) throw new HttpError(400, 'bad name');
    if (!/^[0-9a-f]{40}$/.test(String(p.commit || ''))) throw new HttpError(400, 'bad commit');
    if (!/^https:\/\/[a-z0-9.-]+\/[\w.-]+\/[\w.-]+$/.test(String(p.source_repo || ''))) throw new HttpError(400, 'bad source_repo');
    if (!RISKS.includes(p.risk)) throw new HttpError(400, 'bad risk');
    const c = await env.DB.prepare(`SELECT ${DISPATCH_COLS} FROM board WHERE id = ? AND deleted = 0`).bind(card).first();
    if (!c) throw new HttpError(404, 'card not found');
    // 実行中のカード（claim したマシン本人）か、手動で manifest を渡した場合の未実行/完了カード。承認待ちの再提案も可
    const okStatus = (c.status === 'running' && c.claimed_by === machine) || ['needs_approval', 'done', 'failed', 'skill_proposal'].includes(c.status);
    if (!okStatus) return { ok: false, reason: 'bad_status', status: c.status };
    const existing = await env.DB.prepare('SELECT state FROM skill_proposals WHERE card_id = ?').bind(card).first();
    if (existing && ['approved', 'installed'].includes(existing.state)) return { ok: false, reason: 'already_' + existing.state };
    const suggestedHolders = holdersOf(p.suggested_holders);
    const state = p.risk === 'high' ? 'blocked' : 'pending';
    const data = {
      description: clip(p.description, 600), skill_description: clip(p.skill_description, 600), ref: clip(p.ref, 100), entry: clip(p.entry, 200) || '.',
      license: clip(p.license, 80), homepage: /^https:\/\/[^\s"'<>]+$/.test(String(p.homepage || '')) ? clip(p.homepage, 300) : '', author: clip(p.author, 100), version: clip(p.version, 40), install_notes: clip(p.install_notes, 1000),
      risk_detail: p.risk_detail && typeof p.risk_detail === 'object' ? { static: clip(p.risk_detail.static, 10), ai: p.risk_detail.ai ? clip(p.risk_detail.ai, 10) : null, ai_note: clip(p.risk_detail.ai_note, 300) } : null,
      review_md: clip(p.review_md, 7000),
      findings: (Array.isArray(p.findings) ? p.findings : []).slice(0, 30).map((f) => ({ severity: clip(f.severity, 10), id: clip(f.id, 40), file: clip(f.file, 120), line: Number(f.line) || 0, message: clip(f.message, 200), excerpt: clip(f.excerpt, 160) })),
      totals: p.totals && typeof p.totals === 'object' ? { files: Number(p.totals.files) || 0, bytes: Number(p.totals.bytes) || 0, high: Number(p.totals.high) || 0, medium: Number(p.totals.medium) || 0 } : null,
      scripts: (Array.isArray(p.scripts) ? p.scripts : []).slice(0, 20).map((x) => clip(x, 120)),
      binaries: (Array.isArray(p.binaries) ? p.binaries : []).slice(0, 20).map((x) => clip(x, 120)),
      digest: /^[0-9a-f]{64}$/.test(String(p.digest || '')) ? p.digest : '',
      holder_note: clip(p.holder_note, 300),
      ineligible: (Array.isArray(p.ineligible) ? p.ineligible : []).slice(0, 5).map((x) => ({ holder: clip(x.holder, 20), note: clip(x.note, 120) })),
      quarantine: clip(p.quarantine, 120),
    };
    const suggested = (Array.isArray(p.suggested) ? p.suggested : []).filter((x) => x && HOLDERS.includes(x.holder)).slice(0, 5)
      .map((x) => ({ holder: x.holder, confidence: x.confidence == null ? null : Math.max(0, Math.min(1, Number(x.confidence) || 0)), reason: clip(x.reason, 200), embed_score: x.embed_score == null ? null : Number(x.embed_score) || 0, picked_by: clip(x.picked_by, 20) }));
    const t = now();
    await env.DB.prepare(
      `INSERT INTO skill_proposals (card_id, name, commit_sha, source_repo, risk, state, holders, suggested, data, note, machine, created_at, updated_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,NULL,?10,?11,?11)
       ON CONFLICT(card_id) DO UPDATE SET name=?2, commit_sha=?3, source_repo=?4, risk=?5, state=?6, holders=?7, suggested=?8, data=?9, note=NULL, machine=?10, updated_at=?11`
    ).bind(card, p.name, p.commit, p.source_repo, p.risk, state, JSON.stringify(suggestedHolders), JSON.stringify(suggested), JSON.stringify(data), machine, t).run();
    const dir = b.output_dir && typeof b.output_dir === 'string' && !/[\/\\\u0000-\u001f]/.test(b.output_dir) ? b.output_dir.slice(0, 120) : null;
    const reason = p.risk === 'high' ? 'risk=high のため導入不可（理由は検査結果を参照）' : 'スキル導入は常に承認が必要です（配属先を確認して承認してください）';
    const r = await env.DB.prepare(
      `UPDATE board SET status='skill_proposal', lane='waiting', task_kind='acquire', needs_approval=1, approval_reason=?1, result=COALESCE(?2, result),
         claimed_by=NULL, lease_until=NULL, finished_at=?3, updated_at=?3, output_dir=COALESCE(?4, output_dir)
       WHERE id=?5 AND deleted=0 AND (status IN ('needs_approval','done','failed','skill_proposal') OR (status='running' AND claimed_by=?6))`
    ).bind(reason, b.summary ? clip(b.summary, 1500) : null, t, dir, card, machine).run();
    return { ok: !!r.meta.changes, status: 'skill_proposal', proposal_state: state };
  }

  // ---- 画面（本人）: 承認 / 却下 ----
  async function approve(env, cardId, body) {
    const id = idOk(cardId);
    if (!id) throw new HttpError(400, 'bad id');
    const holders = holdersOf(body && body.holders);
    if (!holders.length) throw new HttpError(400, '配属先を 1 つ以上選んでください');
    const prop = await env.DB.prepare('SELECT * FROM skill_proposals WHERE card_id = ?').bind(id).first();
    if (!prop) throw new HttpError(404, 'proposal not found');
    if (prop.risk === 'high' || prop.state === 'blocked') throw new HttpError(409, 'risk=high のスキルは導入できません');
    if (!['pending', 'failed'].includes(prop.state)) throw new HttpError(409, 'not approvable');
    const card = await env.DB.prepare(`SELECT ${DISPATCH_COLS} FROM board WHERE id = ? AND deleted = 0`).bind(id).first();
    if (!card || card.status !== 'skill_proposal') throw new HttpError(409, 'not approvable');
    const t = now();
    const r = await env.DB.prepare("UPDATE skill_proposals SET state='approved', holders=?1, note=NULL, updated_at=?2 WHERE card_id=?3 AND state IN ('pending','failed')")
      .bind(JSON.stringify(holders), t, id).run();
    if (!r.meta.changes) throw new HttpError(409, 'conflict');
    const data = jparse(prop.data, {});
    const suggested = holdersOf(jparse(prop.suggested, []).filter((x) => x.picked_by).map((x) => x.holder)); // 最初の配属案（学習用）
    const learn = `${prop.name}\n${data.description || ''}\n${data.skill_description || ''}`.slice(0, 1000);
    await env.DB.batch([
      env.DB.prepare("UPDATE board SET status='skill_installing', lane='doing', decided_by='yanagi', updated_at=?1 WHERE id=?2 AND status='skill_proposal'").bind(t, id),
      env.DB.prepare("INSERT INTO inbox (kind, author, title, body, created_at) VALUES ('skill_install', 'yanagi', ?, ?, ?)").bind(
        prop.name,
        JSON.stringify({ card: id, name: prop.name, commit: prop.commit_sha, source_repo: prop.source_repo, entry: data.entry || '.', content_digest: data.digest || '', holders, suggested_holders: suggested, risk: prop.risk, description: clip(data.description, 300), learn_text: learn }),
        t
      ),
    ]);
    return { ok: true, status: 'skill_installing', holders };
  }

  async function reject(env, cardId) {
    const id = idOk(cardId);
    if (!id) throw new HttpError(400, 'bad id');
    const t = now();
    const r = await env.DB.prepare("UPDATE skill_proposals SET state='rejected', updated_at=?1 WHERE card_id=?2 AND state IN ('pending','blocked','failed','needs_attention')").bind(t, id).run();
    if (!r.meta.changes) throw new HttpError(409, 'not rejectable');
    await env.DB.prepare("UPDATE board SET status='rejected', lane='done', decided_by='yanagi', updated_at=?1 WHERE id=?2 AND deleted=0").bind(t, id).run();
    return { ok: true };
  }

  // 画面から配属を切り替える（承認前の下書き。承認時に最終確定する）
  async function setHolders(env, cardId, holdersIn) {
    const id = idOk(cardId);
    if (!id) throw new HttpError(400, 'bad id');
    const r = await env.DB.prepare("UPDATE skill_proposals SET holders=?1, updated_at=?2 WHERE card_id=?3 AND state IN ('pending','failed')")
      .bind(JSON.stringify(holdersOf(holdersIn)), now(), id).run();
    if (!r.meta.changes) throw new HttpError(409, 'not editable');
    return { ok: true };
  }

  // ---- Mac → hub: 導入結果 ----
  async function installed(env, request) {
    const b = await readJson(request, 8 * 1024);
    const card = idOk(b.card);
    const machine = machineOk(b.machine);
    if (!card || !machine || !['installed', 'needs_attention', 'failed'].includes(b.state)) throw new HttpError(400, 'bad params');
    const prop = await env.DB.prepare('SELECT state FROM skill_proposals WHERE card_id = ?').bind(card).first();
    if (!prop || !['approved', 'installed', 'needs_attention'].includes(prop.state)) return { ok: false, reason: 'bad_state' };
    const t = now();
    const note = clip(b.note, 500);
    await env.DB.prepare('UPDATE skill_proposals SET state=?1, note=?2, machine=?3, updated_at=?4 WHERE card_id=?5').bind(b.state, note, machine, t, card).run();
    if (b.state === 'installed') {
      await env.DB.prepare("UPDATE board SET status='done', lane='done', result=?1, finished_at=?2, updated_at=?2, claimed_by=?3 WHERE id=?4 AND deleted=0")
        .bind(`導入しました（${machine}）。${note}`.slice(0, 1500), t, machine, card).run();
    } else if (b.state === 'needs_attention') {
      await env.DB.prepare("UPDATE board SET status='needs_attention', lane='waiting', result=?1, updated_at=?2 WHERE id=?3 AND deleted=0")
        .bind(`要確認: ${note}`.slice(0, 1500), t, card).run();
    } else {
      // 失敗: 承認待ちに戻す（原因は note。承認を押し直せば再試行）
      await env.DB.prepare("UPDATE board SET status='skill_proposal', lane='waiting', result=?1, updated_at=?2 WHERE id=?3 AND deleted=0")
        .bind(`導入に失敗しました（${machine}）: ${note}`.slice(0, 1500), t, card).run();
    }
    return { ok: true };
  }

  // ---- Mac → hub: 各マシンの状況と台帳 ----
  async function report(env, request) {
    const b = await readJson(request, 256 * 1024);
    const machine = machineOk(b.machine);
    if (!machine) throw new HttpError(400, 'machine required');
    const inv = {};
    for (const h of HOLDERS) inv[h] = (Array.isArray(b.inventory && b.inventory[h]) ? b.inventory[h] : []).slice(0, 300).map((x) => ({ name: clip(x.name, 80), kind: clip(x.kind, 8), managed: !!x.managed }));
    const links = (Array.isArray(b.links) ? b.links : []).slice(0, 300).map((l) => ({ name: clip(l.name, 80), holder: HOLDERS.includes(l.holder) ? l.holder : '', state: clip(l.state, 20), note: clip(l.note, 200) }));
    const t = now();
    await env.DB.prepare(
      `INSERT INTO skill_machines (machine, inventory, links, updated_at) VALUES (?1,?2,?3,?4)
       ON CONFLICT(machine) DO UPDATE SET inventory=?2, links=?3, updated_at=?4`
    ).bind(machine, JSON.stringify(inv), JSON.stringify(links), t).run();
    if (b.registry && typeof b.registry === 'object') {
      const names = Object.keys(b.registry).filter((n) => NAME_RE.test(n)).slice(0, 200);
      const stmts = names.map((n) => {
        const s = b.registry[n] || {};
        return env.DB.prepare('INSERT INTO skill_registry (name, body, updated_at) VALUES (?1,?2,?3) ON CONFLICT(name) DO UPDATE SET body=?2, updated_at=?3')
          .bind(n, JSON.stringify({ commit: clip(s.commit, 40), source_repo: clip(s.source_repo, 200), entry: clip(s.entry, 200), holders: holdersOf(s.holders), risk: clip(s.risk, 10), installed_at: clip(s.installed_at, 40), card: clip(s.card, 40), description: clip(s.description, 300) }), t);
      });
      if (names.length) stmts.push(env.DB.prepare(`DELETE FROM skill_registry WHERE name NOT IN (${names.map(() => '?').join(',')})`).bind(...names));
      if (stmts.length) await env.DB.batch(stmts);
    }
    await refreshAttention(env);
    return { ok: true };
  }

  // 全マシンのリンク状態から、同名衝突（exists_other）のあるスキルのカードを needs_attention に / 解消したら戻す
  async function refreshAttention(env) {
    const ms = (await env.DB.prepare('SELECT machine, links FROM skill_machines').all()).results;
    const att = new Map();
    for (const m of ms) for (const l of jparse(m.links, [])) if (l.state === 'exists_other') {
      const a = att.get(l.name) || [];
      a.push(`${m.machine}/${l.holder}: ${l.note}`);
      att.set(l.name, a);
    }
    const props = (await env.DB.prepare("SELECT card_id, name, state FROM skill_proposals WHERE state IN ('installed','needs_attention')").all()).results;
    const t = now();
    for (const p of props) {
      const a = att.get(p.name);
      if (a && p.state === 'installed') {
        const note = `同名が既にあるため上書きしていません: ${a.join(' / ')}`.slice(0, 500);
        await env.DB.batch([
          env.DB.prepare("UPDATE skill_proposals SET state='needs_attention', note=?1, updated_at=?2 WHERE card_id=?3").bind(note, t, p.card_id),
          env.DB.prepare("UPDATE board SET status='needs_attention', lane='waiting', result=?1, updated_at=?2 WHERE id=?3 AND deleted=0").bind(`要確認: ${note}`, t, p.card_id),
        ]);
      } else if (!a && p.state === 'needs_attention') {
        await env.DB.batch([
          env.DB.prepare("UPDATE skill_proposals SET state='installed', note='同名の衝突は解消されました', updated_at=?1 WHERE card_id=?2").bind(t, p.card_id),
          env.DB.prepare("UPDATE board SET status='done', lane='done', result='導入済み（同名の衝突は解消されました）', updated_at=?1 WHERE id=?2 AND deleted=0").bind(t, p.card_id),
        ]);
      }
    }
  }

  // ---- 画面用: カード id → 提案 ----
  async function proposalsByCard(env) {
    const rows = (await env.DB.prepare('SELECT * FROM skill_proposals ORDER BY updated_at DESC LIMIT 40').all()).results;
    const map = {};
    for (const r of rows) {
      const d = jparse(r.data, {});
      map[r.card_id] = {
        name: r.name, commit: r.commit_sha, source_repo: r.source_repo, risk: r.risk, state: r.state, holders: jparse(r.holders, []),
        suggested: jparse(r.suggested, []), note: r.note || '', machine: r.machine || '', updated_at: r.updated_at, ...d,
      };
    }
    return map;
  }

  // ---- MCP 用: 誰が何を持っているか ----
  async function list(env) {
    const [reg, ms, props] = await Promise.all([
      env.DB.prepare('SELECT name, body, updated_at FROM skill_registry ORDER BY name').all(),
      env.DB.prepare('SELECT machine, inventory, updated_at FROM skill_machines ORDER BY machine').all(),
      env.DB.prepare("SELECT card_id, name, risk, state, holders FROM skill_proposals WHERE state IN ('pending','blocked','approved','failed','needs_attention') ORDER BY updated_at DESC LIMIT 20").all(),
    ]);
    return {
      registry: reg.results.map((r) => ({ name: r.name, ...jparse(r.body, {}), updated_at: r.updated_at })),
      machines: ms.results.map((m) => ({ machine: m.machine, inventory: jparse(m.inventory, {}), updated_at: m.updated_at })),
      proposals: props.results.map((p) => ({ card: p.card_id, name: p.name, risk: p.risk, state: p.state, holders: jparse(p.holders, []) })),
    };
  }

  return { propose, approve, reject, setHolders, installed, report, proposalsByCard, list, refreshAttention };
}
