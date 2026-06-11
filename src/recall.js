import fs from 'fs';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import natural from 'natural';
import { globSync } from 'glob';

const TfIdf = natural.TfIdf;
const CEREBRALOS_DIR = path.join(os.homedir(), '.cerebralos');

export async function recallContext(query, options = {}) {
  const { topK = 3, silent = false, paths } = options;
  if (!fs.existsSync(CEREBRALOS_DIR)) {
    if (!silent) console.log(chalk.red('Brain not found. Run `cerebralos init` first.'));
    return [];
  }

  if (!silent) console.log(chalk.gray(`Recalling context for: "${query}"...`));

  const tfidf = new TfIdf();
  const documents = [];

  // Defaults to core/ and peripheral/. options.paths can override the search targets (used by mcp.js).
  const searchPaths = paths ?? [
    path.join(CEREBRALOS_DIR, 'core/**/*.md'),
    path.join(CEREBRALOS_DIR, 'peripheral/**/*.md')
  ];

  const files = searchPaths.flatMap(pattern => globSync(pattern));

  if (files.length === 0) {
    if (!silent) console.log(chalk.yellow('No memories found in the brain yet.'));
    return [];
  }

  // Add documents to TF-IDF
  files.forEach((file, index) => {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      tfidf.addDocument(content);
      documents.push({
        id: index,
        path: file,
        relativePath: path.relative(CEREBRALOS_DIR, file),
        content: content,
        stats: fs.statSync(file)
      });
    } catch (e) {
      // Skip unreadable files
    }
  });

  // Calculate scores
  // TF-IDF assumes whitespace-tokenized text, so queries in unsegmented
  // languages (e.g. Japanese) score zero. Blend in a substring-match score
  // per query term so those queries and proper nouns still hit.
  const tfidfScores = new Map();
  tfidf.tfidfs(query, (i, measure) => {
    if (measure > 0) tfidfScores.set(i, measure);
  });

  const terms = query.split(/\s+/).filter(Boolean);
  const results = [];
  documents.forEach((doc, i) => {
    let substringScore = 0;
    for (const term of terms) {
      const count = doc.content.split(term).length - 1;
      if (count > 0) substringScore += 1 + Math.log(1 + count);
    }
    const score = (tfidfScores.get(i) || 0) + substringScore;
    if (score > 0) {
      results.push({ ...doc, score });
    }
  });

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);
  const topResults = results.slice(0, topK);

  if (!silent) {
    if (topResults.length === 0) {
      console.log(chalk.yellow('No relevant memories found for this query.'));
    } else {
      console.log(chalk.cyan('\n[Pattern Completed]'));
      console.log(chalk.white(`Found ${topResults.length} relevant memories:`));
      
      topResults.forEach((res, i) => {
        console.log(chalk.gray('---'));
        console.log(chalk.white(`Memory ${i + 1}: ${res.relativePath}`));
        console.log(chalk.gray(`Score: ${res.score.toFixed(4)} | Last modified: ${res.stats.mtime.toISOString().split('T')[0]}`));
        
        // Extract a snippet around the matched terms (simplified)
        const snippet = res.content.substring(0, 200).replace(/\n/g, ' ') + '...';
        console.log(chalk.white(`Context: ${snippet}`));
      });
      console.log(chalk.gray('---'));
    }
  }

  return topResults;
}
