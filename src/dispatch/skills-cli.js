// src/dispatch/skills-cli.js — `cerebralos skills <list|sync|inspect|acquire>`
//   list                         台帳(REGISTRY.json)と、Claude/Codex/Grok それぞれのスキル一覧
//   sync                         台帳に従ってこのマシンのリンクを張る/外す（既存の同名は上書きしない）
//   inspect --manifest <file>    manifest から 隔離取得→検査→レビュー→配属案 までを行い、結果を表示（hub には送らない）
//   acquire --card <id> --manifest <file>
//                                上と同じ結果を hub に「導入提案」として出し、カードを承認待ちにして止まる（承認は hub で本人が行う）
import fs from 'fs';
import { loadHubConfig, hubCaps } from '../hub-client.js';
import { loadDispatchConfig, skillsSharedRoot, skillHomes } from './config.js';
import { buildProposal, postProposal, syncSkillLinks } from './skill-acquire.js';
import { readRegistry, inventory } from './skill-registry.js';

export async function skillsCommand(action, options = {}) {
  try {
    if (action === 'list') {
      const shared = skillsSharedRoot();
      console.log(JSON.stringify({ shared_root: shared, registry: readRegistry(shared).skills, inventory: inventory({ homes: skillHomes(), sharedRoot: shared }) }, null, 2));
    } else if (action === 'sync') {
      let hub = null;
      try { hub = loadHubConfig(); const c = await hubCaps(hub); if (!c.skills) hub = null; } catch { hub = null; }
      console.log(JSON.stringify(await syncSkillLinks(hub, loadDispatchConfig(), { force: true }), null, 2));
    } else if (action === 'inspect' || action === 'acquire') {
      if (!options.manifest) throw new Error('--manifest <file> が必要です');
      const raw = JSON.parse(fs.readFileSync(options.manifest, 'utf-8'));
      const proposal = await buildProposal(raw);
      if (action === 'inspect') {
        console.log(JSON.stringify({ ...proposal, review_md: undefined }, null, 2));
        console.log('\n' + proposal.review_md);
      } else {
        if (!options.card) throw new Error('--card <カード id> が必要です');
        const hub = loadHubConfig();
        const cfg = loadDispatchConfig();
        const res = await postProposal(hub, { card: options.card, machine: cfg.machine, proposal, manual: true, summary: options.summary });
        console.log(JSON.stringify({ hub: res, name: proposal.name, risk: proposal.risk, suggested_holders: proposal.suggested_holders }, null, 2));
        if (!res.ok) process.exitCode = 1;
      }
    } else {
      console.error('usage: cerebralos skills <list|sync|inspect --manifest f|acquire --card id --manifest f>');
      process.exitCode = 2;
    }
  } catch (e) {
    console.error(`[skills] 失敗: ${e.message}`);
    process.exitCode = 1;
  }
}
