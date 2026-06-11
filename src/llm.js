// src/llm.js — LLM integration shim (v3, from Connector Layer redesign)
// Delegates to the Connector Layer. Provides callLLM/isLLMAvailable for
// backwards-compatible use by future modules.
// NOTE: sleep.js does NOT use callLLM(). The intelligence layer runs
// `claude -p` headless via execFile/stdin (see sleep.js runIntelligence).
import path from 'path';
import os from 'os';
import { getConnector } from './connectors/index.js';

export async function callLLM(prompt, brainDir = path.join(os.homedir(), '.cerebralos')) {
  const connector = getConnector(brainDir);
  return connector.complete(prompt);
}

export async function isLLMAvailable(brainDir = path.join(os.homedir(), '.cerebralos')) {
  const connector = getConnector(brainDir);
  return connector.isAvailable();
}
