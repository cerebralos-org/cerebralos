// src/connectors/ollama.js — Ollama connector (Connector Layer v3)
// NOTE: sleep.js does NOT import this. The intelligence layer uses `claude -p`
// headless CLI exclusively (vendor-agnostic, no API key required).
// This connector is available for future use by other modules (e.g., consolidate.js).
export class OllamaConnector {
  constructor(model = 'llama3.2', options = {}) {
    this.model = model;
    this.baseUrl = options.base_url || 'http://localhost:11434';
    this.name = 'ollama';
  }

  async complete(prompt) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    try {
      const res = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false
        }),
        signal: controller.signal
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Ollama API error (${res.status}): ${err}`);
      }

      const data = await res.json();
      return data.response;
    } finally {
      clearTimeout(timeout);
    }
  }

  async isAvailable() {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000)
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
