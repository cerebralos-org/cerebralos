export class ClaudeConnector {
  constructor(apiKey, model = 'claude-sonnet-4-20250514', options = {}) {
    this.apiKey = apiKey;
    this.model = model;
    this.options = options;
    this.name = 'claude';
  }

  async complete(prompt) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
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
      throw new Error(`Claude API error (${res.status}): ${err}`);
    }

    const data = await res.json();
    return data.content[0].text;
  }

  async isAvailable() {
    return !!this.apiKey;
  }
}
