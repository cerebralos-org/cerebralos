import fs from 'fs';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import natural from 'natural';
import { globSync } from 'glob';

const TfIdf = natural.TfIdf;
export async function recallContext(query, options = { topK: 3, silent: false }, CEREBRALOS_DIR = path.join(os.homedir(), '.cerebralos')) {
  if (!fs.existsSync(CEREBRALOS_DIR)) {
    if (!options.silent) console.log(chalk.red('Brain not found. Run `cerebralos init` first.'));
    return [];
  }

  if (!options.silent) console.log(chalk.gray(`Recalling context for: "${query}"...`));

  const tfidf = new TfIdf();
  const documents = [];

  // Read all markdown files from core/ and peripheral/
  const searchPaths = [
    path.join(CEREBRALOS_DIR, 'core/**/*.md'),
    path.join(CEREBRALOS_DIR, 'peripheral/**/*.md')
  ];

  const files = searchPaths.flatMap(pattern => globSync(pattern));

  if (files.length === 0) {
    if (!options.silent) console.log(chalk.yellow('No memories found in the brain yet.'));
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
  const results = [];
  tfidf.tfidfs(query, (i, measure) => {
    if (measure > 0) {
      results.push({
        ...documents[i],
        score: measure
      });
    }
  });

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);
  const topResults = results.slice(0, options.topK);

  if (!options.silent) {
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
