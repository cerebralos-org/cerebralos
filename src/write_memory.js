import fs from 'fs';
import path from 'path';
import os from 'os';

const CEREBRALOS_DIR = path.join(os.homedir(), '.cerebralos');

/**
 * peripheral/ にメモリを書き込む
 * MCPの write_memory ツール、および将来の CLI コマンドから呼ばれる
 */
export function writeMemory(content, filename) {
  const peripheralDir = path.join(CEREBRALOS_DIR, 'peripheral');
  fs.mkdirSync(peripheralDir, { recursive: true });

  const date = new Date().toISOString().split('T')[0];
  const resolvedFilename = filename || `${date}-session.md`;

  // 同名ファイルが存在する場合は追記
  const destPath = path.join(peripheralDir, resolvedFilename);
  if (fs.existsSync(destPath)) {
    fs.appendFileSync(destPath, `\n\n---\n\n${content}`);
  } else {
    fs.writeFileSync(destPath, content);
  }

  return destPath;
}
