import fs from 'fs';
import natural from 'natural';
import chalk from 'chalk';

const TfIdf = natural.TfIdf;

// Relative date patterns → absolute date conversion
const RELATIVE_PATTERNS = [
  { regex: /\b(yesterday|昨日)\b/gi, offset: -1 },
  { regex: /\b(today|今日)\b/gi, offset: 0 },
  { regex: /\b(the day before yesterday|一昨日|おととい)\b/gi, offset: -2 },
  { regex: /\b(last week|先週)\b/gi, offset: -7 },
  { regex: /\b(\d+)\s*days?\s*ago\b/gi, offsetFn: (m) => -parseInt(m[1]) },
  { regex: /\b(\d+)\s*日前\b/gi, offsetFn: (m) => -parseInt(m[1]) },
  { regex: /\b(\d+)\s*週間?前\b/gi, offsetFn: (m) => -parseInt(m[1]) * 7 },
];

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

export function absolutizeDates(content, referenceDate) {
  let result = content;

  for (const pattern of RELATIVE_PATTERNS) {
    result = result.replace(pattern.regex, (match, ...groups) => {
      const offset = pattern.offsetFn
        ? pattern.offsetFn(groups)
        : pattern.offset;
      const d = new Date(referenceDate);
      d.setDate(d.getDate() + offset);
      return `${match} (${formatDate(d)})`;
    });
  }

  return result;
}

export function detectDuplicates(files, threshold = 0.85) {
  if (files.length < 2) return [];

  const tfidf = new TfIdf();
  const contents = [];

  for (const file of files) {
    const content = fs.readFileSync(file.path, 'utf-8');
    tfidf.addDocument(content);
    contents.push(content);
  }

  const duplicates = [];

  for (let i = 0; i < files.length; i++) {
    for (let j = i + 1; j < files.length; j++) {
      // Compare TF-IDF vectors using cosine-like similarity
      const termsI = {};
      const termsJ = {};

      tfidf.listTerms(i).forEach(t => { termsI[t.term] = t.tfidf; });
      tfidf.listTerms(j).forEach(t => { termsJ[t.term] = t.tfidf; });

      const allTerms = new Set([...Object.keys(termsI), ...Object.keys(termsJ)]);
      let dot = 0, magI = 0, magJ = 0;

      for (const term of allTerms) {
        const vi = termsI[term] || 0;
        const vj = termsJ[term] || 0;
        dot += vi * vj;
        magI += vi * vi;
        magJ += vj * vj;
      }

      const similarity = (magI > 0 && magJ > 0)
        ? dot / (Math.sqrt(magI) * Math.sqrt(magJ))
        : 0;

      if (similarity >= threshold) {
        // Keep newer, mark older
        const older = files[i].mtime < files[j].mtime ? files[i] : files[j];
        const newer = files[i].mtime < files[j].mtime ? files[j] : files[i];
        duplicates.push({ older, newer, similarity });
      }
    }
  }

  return duplicates;
}

export async function consolidate(signals, brainDir) {
  const actions = [];
  const allFiles = [...signals.core, ...signals.peripheral];

  if (allFiles.length === 0) {
    console.log(chalk.gray('  No new signals to consolidate.'));
    return actions;
  }

  // 1. Absolutize relative dates
  let dateFixed = 0;
  for (const file of allFiles) {
    const content = fs.readFileSync(file.path, 'utf-8');
    const absolutized = absolutizeDates(content, file.mtime);
    if (absolutized !== content) {
      fs.writeFileSync(file.path, absolutized);
      dateFixed++;
      actions.push({ type: 'date-absolutized', path: file.relativePath });
    }
  }
  if (dateFixed > 0) {
    console.log(chalk.gray(`  Absolutized dates in ${dateFixed} files.`));
  }

  // 2. Detect duplicates
  const duplicates = detectDuplicates(allFiles);
  for (const dup of duplicates) {
    // Add superseded_by to the older file's frontmatter
    const content = fs.readFileSync(dup.older.path, 'utf-8');
    if (!content.includes('superseded_by:')) {
      const newerId = dup.newer.relativePath;
      const updated = content.replace(/^(---\n)/, `$1superseded_by: "${newerId}"\n`);
      fs.writeFileSync(dup.older.path, updated);
      actions.push({
        type: 'superseded',
        older: dup.older.relativePath,
        newer: dup.newer.relativePath,
        similarity: dup.similarity.toFixed(3)
      });
    }
  }
  if (duplicates.length > 0) {
    console.log(chalk.gray(`  Found ${duplicates.length} duplicate pairs.`));
  }

  return actions;
}
