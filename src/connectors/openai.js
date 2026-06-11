// src/connectors/openai.js — OpenAI API connector (Connector Layer v3)
// NOTE: sleep.js does NOT import this. The intelligence layer uses `claude -p`
// headless CLI exclusively (vendor-agnostic, no API key required).
// This connector is available for future use by other modules (e.g., consolidate.js).
export class OpenAIConnector {
  constructor(apiKey, model = 'gpt-4o-mini', options = {}) {
    this.apiKey = apiKey;
    this.model = model;
    this.options = options;
    this.name = 'openai';
  }

  async complete(prompt) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI API error (${res.status}): ${err}`);
    }

    const data = await res.json();
    return data.choices[0].message.content;
  }

  async isAvailable() {
    return !!this.apiKey;
  }
}
