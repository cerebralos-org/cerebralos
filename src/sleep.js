import fs from 'fs';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import simpleGit from 'simple-git';

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
  // Mock: In a real app, this would check file stats and move old files to archive/
  setTimeout(async () => {
    console.log(chalk.gray('Archived 3 noisy memories to create space.'));

    // 2. Dream Consolidation (Reflux)
    console.log(chalk.gray('Synthesizing Core and Peripheral memories...'));
    
    const date = new Date().toISOString().split('T')[0];
    const dreamPath = path.join(CEREBRALOS_DIR, `dreams/${date}.md`);
    
    const dreamContent = `# Dream Log — ${date}

## Morning Insight

While reviewing your conversation about "CerebraLOS architecture" (core/2026-03-11_session.md),
I noticed a connection with a Hacker News thread your agent found about "memory-augmented LLMs"
(peripheral/web_cache/2026-03-11_hn_thread.md).

**The Connection:**
Your idea of "Active Forgetting" directly addresses the #1 complaint in the thread:
"My AI remembers too much irrelevant context and it degrades output quality."

You are not alone in this thought. 47 developers expressed the same frustration.

→ \`cerebralos explore\` to read the full thread.

---
*This insight was generated during the Sleep Job at 03:00 AM.*
`;

    fs.writeFileSync(dreamPath, dreamContent);
    
    // Commit the dream
    await git.add('.');
    await git.commit(`[Sleep Job] Dream consolidation for ${date}`);

    console.log(chalk.green('Sleep Job complete. A new Morning Insight is ready.'));
  }, 1500);
}
