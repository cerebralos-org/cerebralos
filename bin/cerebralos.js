#!/usr/bin/env node
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// src/cli.js を実行
const cliPath = join(__dirname, '..', 'src', 'cli.js');
await import(cliPath);
