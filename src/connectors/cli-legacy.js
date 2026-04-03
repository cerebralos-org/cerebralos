import { execFileSync } from 'child_process';
import { existsSync } from 'fs';

export class CLILegacyConnector {
  constructor(options = {}) {
    this.command = options.command || null;
    this.name = 'cli';
    this._resolved = null;
  }

  _resolveCommand() {
    if (this._resolved) return this._resolved;

    if (this.command) {
      this._resolved = this.command;
      return this._resolved;
    }

    // Auto-detect: llm CLI or claude CLI
    for (const cmd of ['llm', 'claude']) {
      try {
        execFileSync('which', [cmd], { stdio: 'pipe' });
        this._resolved = cmd;
        return this._resolved;
      } catch {
        // not found
      }
    }

    return null;
  }

  async complete(prompt) {
    const cmd = this._resolveCommand();
    if (!cmd) throw new Error('No LLM CLI found (llm or claude)');

    try {
      // claude CLI uses -p flag; llm CLI accepts prompt via stdin
      const args = cmd === 'claude' ? ['-p', prompt] : [];
      const input = cmd === 'claude' ? undefined : prompt;

      const result = execFileSync(cmd, args, {
        input,
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024,
        timeout: 120000
      });
      return result.trim();
    } catch (e) {
      throw new Error(`CLI command failed: ${e.message}`);
    }
  }

  async isAvailable() {
    return !!this._resolveCommand();
  }
}
