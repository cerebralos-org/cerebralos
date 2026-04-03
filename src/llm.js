/**
 * LLM統合モジュール v2
 *
 * Connector Layer に委譲。callLLM/isLLMAvailable のシグネチャを維持して後方互換。
 *
 * 優先順位 (provider: "auto"):
 * 1. ANTHROPIC_API_KEY → Claude API
 * 2. OPENAI_API_KEY → OpenAI API
 * 3. Ollama (localhost:11434) → Ollama API
 * 4. llm/claude CLI → CLI Legacy
 * 5. なし → TF-IDF fallback
 */

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
