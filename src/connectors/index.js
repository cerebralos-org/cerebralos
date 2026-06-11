// src/connectors/index.js — Connector Layer entry point (v3)
// Selects the appropriate LLM connector based on config.json `connector.provider`.
// NOTE: sleep.js does NOT use this. The intelligence layer uses `claude -p`
// headless CLI exclusively (vendor-agnostic, no API key required).
// This module is available for future use by consolidate.js or other modules.
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ClaudeConnector } from './claude.js';
import { OpenAIConnector } from './openai.js';
import { OllamaConnector } from './ollama.js';
import { CLILegacyConnector } from './cli-legacy.js';

// Null connector: always falls back to TF-IDF / machine layer
const nullConnector = {
  name: 'none',
  async complete() { throw new Error('No LLM configured'); },
  async isAvailable() { return false; }
};

function loadConfig(brainDir) {
  const configPath = path.join(brainDir, '.brain/config.json');
  if (!fs.existsSync(configPath)) return {};
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

function createConnector(provider, model, apiKeyEnv, options) {
  switch (provider) {
    case 'claude': {
      const key = process.env[apiKeyEnv || 'ANTHROPIC_API_KEY'];
      if (!key) throw new Error(`${apiKeyEnv || 'ANTHROPIC_API_KEY'} not set`);
      return new ClaudeConnector(key, model || undefined, options);
    }
    case 'openai': {
      const key = process.env[apiKeyEnv || 'OPENAI_API_KEY'];
      if (!key) throw new Error(`${apiKeyEnv || 'OPENAI_API_KEY'} not set`);
      return new OpenAIConnector(key, model || undefined, options);
    }
    case 'ollama':
      return new OllamaConnector(model || undefined, options);
    case 'cli':
      return new CLILegacyConnector(options);
    case 'none':
      return nullConnector;
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

async function autoDetect(model, options) {
  // 1. ANTHROPIC_API_KEY
  if (process.env.ANTHROPIC_API_KEY) {
    return new ClaudeConnector(process.env.ANTHROPIC_API_KEY, model || undefined, options);
  }

  // 2. OPENAI_API_KEY
  if (process.env.OPENAI_API_KEY) {
    return new OpenAIConnector(process.env.OPENAI_API_KEY, model || undefined, options);
  }

  // 3. Ollama running locally
  const ollama = new OllamaConnector(model || undefined, options);
  if (await ollama.isAvailable()) {
    return ollama;
  }

  // 4. CLI (llm or claude)
  const cli = new CLILegacyConnector(options);
  if (await cli.isAvailable()) {
    return cli;
  }

  // 5. Nothing available
  return nullConnector;
}

// Cache per brainDir
const cache = new Map();

export function getConnector(brainDir = path.join(os.homedir(), '.cerebralos')) {
  if (cache.has(brainDir)) return cache.get(brainDir);

  const config = loadConfig(brainDir);
  // config.connector (v3) provides optional Connector Layer settings.
  // config.llm is not read — intelligence layer uses `claude -p` headless exclusively.
  const connectorConfig = config.connector || {};
  const { provider = 'auto', model = null, api_key_env = null, options = {} } = connectorConfig;

  let connector;

  if (provider === 'auto') {
    // autoDetect is async; wrap in a lazy proxy
    let resolved = null;
    connector = {
      name: 'auto',
      async complete(prompt) {
        if (!resolved) resolved = await autoDetect(model, options);
        return resolved.complete(prompt);
      },
      async isAvailable() {
        if (!resolved) resolved = await autoDetect(model, options);
        return resolved.isAvailable();
      }
    };
  } else {
    connector = createConnector(provider, model, api_key_env, options);
  }

  cache.set(brainDir, connector);
  return connector;
}

// Clear cache (for testing)
export function clearConnectorCache() {
  cache.clear();
}
