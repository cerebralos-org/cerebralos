/**
 * LLMプロバイダー抽象レイヤー
 * 対応プロバイダー: claude | openai | github-actions | none
 *
 * API系はAPIキーを環境変数から読み込む（configのapi_key_envで指定）
 * github-actionsモードはsleep.jsがgit pushのみ行い、LLM呼び出しはActions側で行う
 */

/**
 * メモリファイルのリストからDream生成用プロンプトを組み立てる
 */
export function buildDreamPrompt(memories) {
  const memorySections = memories
    .map(m => `### ${m.relativePath}\n${m.content.substring(0, 800)}`)
    .join('\n\n---\n\n');

  return `You are the subconscious of an AI system. Your task is to synthesize a "Dream Log" — a short, insightful reflection that finds meaningful connections across the following memory fragments.

## Memory Fragments
${memorySections}

## Instructions
- Find 1-2 non-obvious connections between these memories
- Write a Dream Log in this format:
  - **Title**: A short poetic title for the dream
  - **The Connection**: 2-3 sentences explaining the insight
  - **Implication**: One actionable implication for the user
- Keep it under 200 words
- Write in the same language as the majority of the memory fragments
- Do NOT summarize. Find CONNECTIONS.

Respond with only the Dream Log content, no preamble.`;
}

/**
 * Claude API でDreamを生成する
 */
async function generateWithClaude(prompt, llmConfig) {
  let Anthropic;
  try {
    const mod = await import('@anthropic-ai/sdk');
    Anthropic = mod.default;
  } catch (e) {
    throw new Error(
      'Claude provider requires @anthropic-ai/sdk.\n' +
      'Run: npm install -g @anthropic-ai/sdk'
    );
  }

  const apiKeyEnv = llmConfig.api_key_env || 'ANTHROPIC_API_KEY';
  const apiKey = process.env[apiKeyEnv];
  if (!apiKey) {
    throw new Error(
      `API key not found. Set the ${apiKeyEnv} environment variable.\n` +
      'Example: export ANTHROPIC_API_KEY=sk-ant-...'
    );
  }

  const client = new Anthropic({ apiKey });
  const model = llmConfig.model || 'claude-opus-4-6';

  const message = await client.messages.create({
    model,
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  });

  return message.content[0].text;
}

/**
 * OpenAI API でDreamを生成する
 */
async function generateWithOpenAI(prompt, llmConfig) {
  let OpenAI;
  try {
    const mod = await import('openai');
    OpenAI = mod.default;
  } catch (e) {
    throw new Error(
      'OpenAI provider requires openai SDK.\n' +
      'Run: npm install -g openai'
    );
  }

  const apiKeyEnv = llmConfig.api_key_env || 'OPENAI_API_KEY';
  const apiKey = process.env[apiKeyEnv];
  if (!apiKey) {
    throw new Error(
      `API key not found. Set the ${apiKeyEnv} environment variable.\n` +
      'Example: export OPENAI_API_KEY=sk-...'
    );
  }

  const client = new OpenAI({ apiKey });
  const model = llmConfig.model || 'gpt-4o';

  const completion = await client.chat.completions.create({
    model,
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  });

  return completion.choices[0].message.content;
}

/**
 * Dream生成のメインエントリーポイント
 *
 * @param {Array} memories - recallContextの結果配列（relativePath, content）
 * @param {Object} config  - .brain/config.json の内容
 * @returns {string|null}  - 生成されたDreamテキスト、またはnull（github-actionsモード）
 */
export async function generateDream(memories, config) {
  const llmConfig = config.llm || {};
  const provider = llmConfig.provider || 'none';

  if (provider === 'none') return null;
  if (provider === 'github-actions') return null; // Actions側で処理

  const prompt = buildDreamPrompt(memories);

  if (provider === 'claude') return await generateWithClaude(prompt, llmConfig);
  if (provider === 'openai') return await generateWithOpenAI(prompt, llmConfig);

  throw new Error(`Unknown LLM provider: "${provider}". Use: claude | openai | github-actions | none`);
}
