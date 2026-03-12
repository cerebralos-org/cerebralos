import fs from 'fs';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import simpleGit from 'simple-git';
import { globSync } from 'glob';
import { recallContext } from './recall.js';

const CEREBRALOS_DIR = path.join(os.homedir(), '.cerebralos');

export async function runSleepJob() {
  if (!fs.existsSync(CEREBRALOS_DIR)) {
    console.log(chalk.red('Brain not found. Run `cerebralos init` first.'));
    return;
  }

  console.log(chalk.blue('Good night. Your brain is now dreaming...'));
  
  const git = simpleGit(CEREBRALOS_DIR);

  // 1. Active Forgetting (Ma / 間)
  console.log(chalk.gray('Running Active Forgetting (Entropy Management)...'));
  
  const configPath = path.join(CEREBRALOS_DIR, '.brain/config.json');
  let decayThresholdDays = 30;
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    decayThresholdDays = config.active_forgetting?.decay_threshold_days || 30;
  }

  const now = new Date();
  const thresholdDate = new Date(now.getTime() - (decayThresholdDays * 24 * 60 * 60 * 1000));
  
  const searchPaths = [
    path.join(CEREBRALOS_DIR, 'core/**/*.md'),
    path.join(CEREBRALOS_DIR, 'peripheral/**/*.md')
  ];
  
  const files = searchPaths.flatMap(pattern => globSync(pattern));
  let archivedCount = 0;

  for (const file of files) {
    const stats = fs.statSync(file);
    if (stats.mtime < thresholdDate) {
      // Move to archive
      const relativePath = path.relative(CEREBRALOS_DIR, file);
      const archivePath = path.join(CEREBRALOS_DIR, 'archive', relativePath);
      
      fs.mkdirSync(path.dirname(archivePath), { recursive: true });
      
      // Use git mv if possible, otherwise regular mv
      try {
        await git.mv(file, archivePath);
      } catch (e) {
        fs.renameSync(file, archivePath);
      }
      archivedCount++;
    }
  }

  console.log(chalk.gray(`Archived ${archivedCount} memories to create space.`));

  // 2. Dream Consolidation (Reflux)
  console.log(chalk.gray('Synthesizing Core and Peripheral memories...'));
  
  // Find the most recent core memory
  const coreFiles = globSync(path.join(CEREBRALOS_DIR, 'core/**/*.md'))
    .map(f => ({ path: f, mtime: fs.statSync(f).mtime }))
    .sort((a, b) => b.mtime - a.mtime);

  let dreamContent = '';
  const date = new Date().toISOString().split('T')[0];

  if (coreFiles.length > 0) {
    const latestCore = coreFiles[0];
    const coreContent = fs.readFileSync(latestCore.path, 'utf-8');
    
    // Extract a keyword from the latest core memory (simplified)
    const words = coreContent.split(/\s+/).filter(w => w.length > 5);
    const keyword = words.length > 0 ? words[0] : 'memory';

    // Find related peripheral memories
    const related = await recallContext(keyword, { topK: 2, silent: true });
    const peripheralMatch = related.find(r => r.relativePath.startsWith('peripheral/'));

    if (peripheralMatch) {
      dreamContent = `# Dream Log — ${date}

## Morning Insight

While reviewing your recent thought in \`${path.relative(CEREBRALOS_DIR, latestCore.path)}\`,
I noticed a connection with a memory from the world: \`${peripheralMatch.relativePath}\`.

**The Connection:**
Both touch upon the concept of "${keyword}". 
The world memory states: "${peripheralMatch.content.substring(0, 100).replace(/\n/g, ' ')}..."

→ \`cerebralos explore\` to read the full context.

---
*This insight was generated during the Sleep Job at ${new Date().toLocaleTimeString()}.*
`;
    }
  }

  // Fallback dream if no connection found
  if (!dreamContent) {
    dreamContent = `# Dream Log — ${date}

## Morning Insight

The brain rested quietly tonight. Space was created.
No new connections were forced.

---
*This insight was generated during the Sleep Job at ${new Date().toLocaleTimeString()}.*
`;
  }

  const dreamPath = path.join(CEREBRALOS_DIR, `dreams/${date}.md`);
  fs.writeFileSync(dreamPath, dreamContent);
  
  // Commit the dream
  try {
    await git.add('.');
    await git.commit(`[Sleep Job] Dream consolidation for ${date}`);
  } catch (e) {
    // Ignore git errors if nothing to commit
  }

  console.log(chalk.green('Sleep Job complete. A new Morning Insight is ready.'));
}
