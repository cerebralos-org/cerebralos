// src/util.js — shared utilities (paths, config, review-queue)
// The review-queue is the single path from the intelligence layer into the
// knowledge repo: loops may only write here, and promotion happens on approval.
import fs from 'fs';
import path from 'path';
import os from 'os';
import { t } from './messages.js';

export const CEREBRALOS_DIR = path.join(os.homedir(), '.cerebralos');
export const STATE_DIR = path.join(CEREBRALOS_DIR, 'state');
export const QUEUE_PATH = path.join(STATE_DIR, 'review-queue.md');

export function todayStr(d = new Date()) {
  // Local timezone (toISOString is UTC, which shifts the date around midnight).
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

let configCache = null;

export function loadConfig() {
  if (configCache !== null) return configCache;
  const p = path.join(CEREBRALOS_DIR, '.brain/config.json');
  try {
    configCache = JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    configCache = {};
  }
  return configCache;
}

// Drop the cached config (used by tests, and after init rewrites config.json).
export function clearConfigCache() {
  configCache = null;
}

// Expand a leading `~` to the user's home directory.
function expandTilde(p) {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

// Root of the knowledge repository (where approved entries are promoted to).
// Uses config `knowledge_repo` when set (absolute or `~`-prefixed path);
// otherwise defaults to ~/.cerebralos/knowledge so the brain is fully
// self-contained out of the box.
export function knowledgeRepo() {
  const configured = loadConfig().knowledge_repo;
  if (typeof configured === 'string' && configured.trim() !== '') {
    return path.resolve(expandTilde(configured.trim()));
  }
  return path.join(CEREBRALOS_DIR, 'knowledge');
}

// ---- review-queue ----
// ## RQ-2026-06-13-01
// - type: knowledge-promotion | deadline-risk | inventory | hygiene
// - title: <one line>
// - evidence: <source (which peripheral file)>
// - target: knowledge/<topic>/<slug>.md   # promotion only
// - body: |
//     <content written verbatim to target on approval (4-space indented)>
// - status: pending | approved | rejected

const FIELD_ORDER = ['type', 'title', 'confidence', 'why', 'evidence', 'target', 'created', 'reason'];

export function parseQueue() {
  if (!fs.existsSync(QUEUE_PATH)) return [];
  const content = fs.readFileSync(QUEUE_PATH, 'utf-8');
  const entries = [];
  const blocks = content.split(/^## +/m).slice(1);
  for (const block of blocks) {
    const lines = block.split('\n');
    const entry = { id: lines[0].trim(), body: '', status: 'pending' };
    let inBody = false;
    for (const line of lines.slice(1)) {
      if (inBody) {
        if (line.startsWith('    ') || line.trim() === '') {
          entry.body += line.replace(/^ {4}/, '') + '\n';
          continue;
        }
        inBody = false;
      }
      const m = line.match(/^- ([\w-]+): ?(.*)$/);
      if (!m) continue;
      if (m[1] === 'body') {
        inBody = true; // `- body: |` form; content is the indented block on following lines
      } else {
        entry[m[1]] = m[2].trim();
      }
    }
    entry.body = entry.body.replace(/\n+$/, '\n');
    if (entry.body === '\n') entry.body = '';
    entries.push(entry);
  }
  return entries;
}

export function saveQueue(entries) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  let out = '# Review Queue\n\n';
  out += `> ${t('review_queue_file_note')}\n\n`;
  for (const e of entries) {
    out += `## ${e.id}\n`;
    for (const k of FIELD_ORDER) {
      if (e[k]) out += `- ${k}: ${e[k]}\n`;
    }
    if (e.body) {
      const indented = e.body
        .replace(/\n$/, '')
        .split('\n')
        .map((l) => (l ? `    ${l}` : ''))
        .join('\n');
      out += `- body: |\n${indented}\n`;
    }
    out += `- status: ${e.status || 'pending'}\n\n`;
  }
  fs.writeFileSync(QUEUE_PATH, out);
}

// Append entries from the machine layer (weekly/monthly).
// Ids are auto-numbered as RQ-<date>-NN.
export function appendQueueEntries(newEntries) {
  const entries = parseQueue();
  const date = todayStr();
  let seq = entries.filter((e) => e.id.startsWith(`RQ-${date}-`)).length;
  const added = [];
  for (const e of newEntries) {
    seq += 1;
    const entry = {
      status: 'pending',
      created: date,
      ...e,
      id: `RQ-${date}-${String(seq).padStart(2, '0')}`,
    };
    entries.push(entry);
    added.push(entry);
  }
  saveQueue(entries);
  return added;
}
