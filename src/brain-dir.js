/**
 * Brain ディレクトリの解決
 *
 * 優先順位:
 * 1. --local フラグ → カレントディレクトリの .cerebralos/
 * 2. --brain <path> → 指定パス
 * 3. CEREBRALOS_DIR 環境変数
 * 4. デフォルト: ~/.cerebralos
 */

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
