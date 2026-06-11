// src/brain-dir.js — Brain directory resolution (v3)
// Priority:
//   1. --local flag  → .cerebralos/ in current directory
//   2. --brain <path> → specified path
//   3. CEREBRALOS_DIR env var
//   4. default: ~/.cerebralos
// Used by cli.js write command and mcp.js. Other commands (sleep/wake/recall/etc.)
// use the CEREBRALOS_DIR constant from util.js for consistency.
import path from 'path';
import os from 'os';

export function resolveBrainDir(options = {}) {
  if (options.local) {
    return path.resolve(process.cwd(), '.cerebralos');
  }
  if (options.brain) {
    return path.resolve(options.brain);
  }
  if (process.env.CEREBRALOS_DIR) {
    return path.resolve(process.env.CEREBRALOS_DIR);
  }
  return path.join(os.homedir(), '.cerebralos');
}
