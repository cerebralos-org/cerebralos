import fs from 'fs';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import natural from 'natural';
import { globSync } from 'glob';
import { t } from './i18n.js';

const TfIdf = natural.TfIdf;
const CEREBRALOS_DIR = path.join(os.homedir(), '.cerebralos');

function formatMemoryAge(mtime) {
  const now = new Date();
  const diffDays = Math.floor((now - mtime) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

function getMemoryLayer(relativePath) {
  if (relativePath.startsWith('archive/frozen')) return 'frozen';
  if (relativePath.startsWith('archive/compressed')) return 'compressed';
  if (relativePath.startsWith('archive')) return 'archived';
  return 'active';
}

function extractSnippet(content, layer) {
  const clean = content
    .replace(/<!--.*?-->/gs, '')
    .replace(/\n/g, ' ')
    .trim();
  const maxLen = layer === 'active' ? 200 : 120;
  return clean.substring(0, maxLen) + (clean.length > maxLen ? '...' : '');
}

export async function recallContext(query, options = { topK: 3, silent: false }) {
  if (!fs.existsSync(CEREBRALOS_DIR)) {
    if (!options.silent) console.log(chalk.red(t('recall.no_brain')));
    return [];
  }

  if (!options.silent) console.log(chalk.gray(t('recall.recalling', { query })));

  const tfidf = new TfIdf();
  const documents = [];

  const searchPaths = [
    path.join(CEREBRALOS_DIR, 'core/**/*.md'),
    path.join(CEREBRALOS_DIR, 'peripheral/**/*.md'),
    path.join(CEREBRALOS_DIR, 'archive/compressed/**/*.md'),
  ];

  const files = searchPaths.flatMap(pattern => globSync(pattern));

  if (files.length === 0) {
    if (!options.silent) console.log(chalk.yellow(t('recall.no_memories')));
    return [];
  }

  files.forEach((file, index) => {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      tfidf.addDocument(content);
      const relativePath = path.relative(CEREBRALOS_DIR, file);
      documents.push({
        id: index,
        path: file,
        relativePath,
        content,
        stats: fs.statSync(file),
        layer: getMemoryLayer(relativePath),
      });
    } catch {}
  });

  const results = [];
  tfidf.tfidfs(query, (i, measure) => {
    if (measure > 0) results.push({ ...documents[i], score: measure });
  });

  results.sort((a, b) => {
    const layerBonus = (r) => r.layer === 'active' ? 0.1 : 0;
    return (b.score + layerBonus(b)) - (a.score + layerBonus(a));
  });
  const topResults = results.slice(0, options.topK);

  if (!options.silent) {
    if (topResults.length === 0) {
      console.log(chalk.yellow(t('recall.nothing')));
    } else {
      console.log(chalk.cyan('\n  ' + t('recall.surfaced')));
      console.log('');

      topResults.forEach((res, i) => {
        const age = formatMemoryAge(res.stats.mtime);
        const isCompressed = res.layer === 'compressed';
        const snippet = extractSnippet(res.content, res.layer);

        const nameColor = isCompressed ? chalk.dim : chalk.white;
        const snippetColor = isCompressed ? chalk.dim : chalk.gray;
        const ageLabel = isCompressed
          ? chalk.dim(`  ◌ ${age} — ${t('recall.faded')}`)
          : chalk.dim(`  ● ${age}`);

        console.log(nameColor(`  ${i + 1}. ${res.relativePath}`));
        console.log(ageLabel);
        console.log(snippetColor(`     ${snippet}`));
        console.log('');
      });
    }
  }

  return topResults;
}
