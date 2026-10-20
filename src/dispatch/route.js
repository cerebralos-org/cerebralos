// src/dispatch/route.js — 担当判定（EmbeddingGemma の cosine 類似度）。すべて Mac 内で完結（タスク内容を外に出さない）
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { AGENTS, EMBED_MODEL, OLLAMA, examplesPath } from './config.js';
import { brainPath } from '../hub-client.js';

export const PROFILES = {
  claude: '設計・実装・長文の構成づくり・文章執筆。CerebraLOS や Mac 上の作業、システム全体の設計、ドキュメント作成、リファクタ方針の検討、複数ファイルにまたがる整理。',
  codex: 'コード修正・リポジトリ作業・バグ修正・テスト追加・自動化スクリプト。既存コードベースへの具体的な変更、ビルドやCIの修正、ライブラリ更新。',
  gemini: '調査・比較・根拠確認・Google 系サービス。最新情報のリサーチ、製品やサービスの比較表づくり、出典付きのファクトチェック、Google Workspace や Gemini 関連の確認。',
  grok: 'X（Twitter）のトレンド・速報・X 上の反応。話題のポストの収集、バズっている投稿の分析、リアルタイムの世間の反応や炎上状況の把握。',
  chatgpt: 'ChatGPT 側で進めている案件。ChatGPT の Space やクラウド PC での作業、画像生成、Forum などの ChatGPT 上のやり取り、ChatGPT のプロジェクト内で続けている作業。',
  grok_bot: 'Grok Bot（xAI）。クラウドの PC とブラウザを持ち 24 時間動ける常駐エージェント。X（旧 Twitter）の調査・長時間のウェブ作業・定期的な見回り・スマホからの依頼の受け皿に向く。手元の Mac のファイルには触れない。',
  elevenlabs: 'ナレーション・読み上げ・効果音・声。台本テキストを ElevenLabs で音声（mp3）にする、効果音を作る。やなぎの声での読み上げ、音声ファイルの生成。',
  colab_video: '動画を生成・映像を作る。テキストのプロンプトから AI で動画クリップ（mp4・音声付き）を生成する。MiniMax H3 を Colab の GPU で動かす。',
};

export const SEED_EXAMPLES = {
  claude: [
    'CerebraLOS の記憶設計を見直して、新しい構成案を考える',
    'Mac の launchd 設定を整理して、常駐ジョブの一覧と役割をまとめる',
    '新しい講座のカリキュラム全体の構成を長文でまとめる',
    'hub のボード画面の使いやすさを改善する設計を考える',
    'このプロジェクトの README を最新の仕様に合わせて書き直す',
    'エージェントゼミの運営フローを設計して手順書にする',
    '週次レポートの構成テンプレートを作る',
    'Mac mini に実行環境を移すための移行計画を立てる',
  ],
  codex: [
    'このリポジトリのログイン処理のバグを直す',
    'テストが落ちている原因を調べて修正するパッチを作る',
    'シェルスクリプトで毎朝のバックアップを自動化する',
    'package.json の依存ライブラリを更新してビルドを通す',
    'API のエラー処理にリトライ処理を追加する',
    'CLI にオプションを一つ追加して、ユニットテストも書く',
    'GitHub Actions のワークフローが失敗するのを直す',
    'Python のスクリプトをリファクタして関数に分ける',
  ],
  gemini: [
    '主要な生成AIサービスの料金プランを比較表にまとめる',
    '最新の Claude Code のアップデート内容を調べて根拠つきで整理する',
    'Google Workspace の新機能を調べて要点をまとめる',
    '競合する3つのサービスの違いを出典つきで比較する',
    'この数字が正しいか一次情報で裏取りする',
    'Gemini の最新モデルの特徴とできることを調べる',
    '海外の AI 導入事例を集めて傾向を整理する',
    'Google カレンダーと Notion の連携方法を調べて比較する',
  ],
  grok: [
    'X で今日話題になっている AI 関連のトレンドを集める',
    'ClaudeCode についての X 上の最近の反応をまとめる',
    '速報ネタになりそうな X の投稿を探す',
    '今バズっているポストの傾向を分析する',
    'X で新モデル発表に対する世間の反応を見たい',
    '炎上している話題とその論点を X から拾う',
    'ハッシュタグ #生成AI の直近の盛り上がりを確認する',
    '同業のアカウントが今何を発信しているかを X で調べる',
  ],
  chatgpt: [
    'ChatGPT の Space で進めている企画書の続きを作る',
    'ChatGPT のクラウド PC でスクレイピングの検証を進める',
    'サムネイル用の画像を ChatGPT で生成する',
    'ChatGPT の Forum で議論している案件の返答案をまとめる',
    'ChatGPT プロジェクトに入れている資料をもとに要点を整理する',
    'ChatGPT エージェントにブラウザ作業をやらせて結果を持ち帰る',
    'ChatGPT で作っているバナー画像のバリエーションを増やす',
    'ChatGPT のカスタムGPTの指示文を改善する',
  ],
  grok_bot: [
    'X で競合アカウントの投稿を一週間分さかのぼって調べて一覧にする',
    '毎朝 X と主要ニュースサイトを見回って AI の新発表があれば報告して',
    'このサイトの料金ページを定期的に見て、変更があったら知らせて',
    'スマホから頼んだ調べものをクラウドで進めて結果を返しておいて',
    '数十ページあるウェブサイトをブラウザで巡回して情報を集めて表にする',
    'X で特定のキーワードの反応を数時間おきに見張って変化をまとめる',
    '外出中に頼んだウェブ上の長い下調べを、夜のうちに終わらせておいて',
    'Grok Bot に X のスレッドを読み込ませて論点を整理させる',
  ],
  elevenlabs: [
    'この台本をやなぎの声でナレーションにして mp3 で欲しい',
    '次の文章を読み上げ音声にして',
    '講座の冒頭ナレーションを音声化する',
    'ドアが閉まる効果音を3秒で作って',
    '拍手と歓声の効果音を生成する',
    'この原稿を ElevenLabs で読み上げて',
    '動画用の効果音（シャキーンという音）を作る',
    'ウェビナーのオープニング音声をナレーションで作る',
  ],
  colab_video: [
    '夕暮れの海辺を歩く人の動画を生成して',
    'このプロンプトで5秒の映像を作って',
    'ショート向けの縦動画を AI で生成する',
    '都会の夜景をドローンで撮ったような動画を作る',
    'アニメ風の猫が走る映像を生成して',
    '商品紹介の短い動画クリップを AI で作る',
    'MiniMax H3 で動画を生成する',
    '雨の街角の実写風ショート動画を10秒で作って',
  ],
};

// ---- examples ファイル ----
export function ensureExamples() {
  const p = examplesPath();
  if (fs.existsSync(p)) {
    // 後から追加した担当（例: elevenlabs / colab_video）の例が既存ファイルに 1 件も無ければ、その担当の種だけ追記する
    try {
      const have = new Set();
      for (const line of fs.readFileSync(p, 'utf-8').split('\n')) { try { have.add(JSON.parse(line).agent); } catch { /* 壊れた行 */ } }
      const add = [];
      for (const a of AGENTS) if (!have.has(a) && SEED_EXAMPLES[a]) for (const text of SEED_EXAMPLES[a]) add.push(JSON.stringify({ agent: a, text, source: 'seed' }));
      if (add.length) {
        const cur = fs.readFileSync(p, 'utf-8');
        fs.appendFileSync(p, (cur && !cur.endsWith('\n') ? '\n' : '') + add.join('\n') + '\n');
      }
    } catch { /* 読めなければそのまま */ }
    return p;
  }
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const lines = [];
  for (const a of AGENTS) for (const text of SEED_EXAMPLES[a]) lines.push(JSON.stringify({ agent: a, text, source: 'seed' }));
  fs.writeFileSync(p, lines.join('\n') + '\n');
  return p;
}

export function loadExamples() {
  const p = ensureExamples();
  const out = [];
  for (const line of fs.readFileSync(p, 'utf-8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const o = JSON.parse(line);
      if (AGENTS.includes(o.agent) && typeof o.text === 'string' && o.text.trim()) out.push({ agent: o.agent, text: o.text.trim().slice(0, 1000) });
    } catch { /* 壊れた行は飛ばす */ }
  }
  return out;
}

// 「担当を変更」の正解例を追記（同じ文×担当の重複は追加しない）
export function addExample(agent, text, source = 'yanagi') {
  if (!AGENTS.includes(agent) || !String(text || '').trim()) return false;
  const p = ensureExamples();
  const t = String(text).trim().slice(0, 1000);
  const dup = loadExamples().some((e) => e.agent === agent && e.text === t);
  if (dup) return false;
  fs.appendFileSync(p, JSON.stringify({ agent, text: t, source }) + '\n');
  return true;
}

// ---- 埋め込み（キャッシュ付き）----
const PREFIX = 'task: classification | query: ';
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex');
const cachePath = () => brainPath('dispatch-embed-cache.json');
function loadCache() {
  try { return JSON.parse(fs.readFileSync(cachePath(), 'utf-8')); } catch { return {}; }
}

export async function embedRaw(texts, model = EMBED_MODEL) {
  const res = await fetch(`${OLLAMA}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: texts.map((t) => PREFIX + t) }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`ollama embed -> HTTP ${res.status}`);
  const j = await res.json();
  if (!Array.isArray(j.embeddings) || j.embeddings.length !== texts.length) throw new Error('ollama embed: 応答が不正');
  return j.embeddings;
}

export async function embedAll(texts, model = EMBED_MODEL) {
  const cache = loadCache();
  const keys = texts.map((t) => sha(model + '\n' + t));
  const miss = [...new Set(keys.filter((k) => !cache[k]).map((k) => keys.indexOf(k)))];
  if (miss.length) {
    const vecs = await embedRaw(miss.map((i) => texts[i]), model);
    miss.forEach((i, n) => { cache[keys[i]] = vecs[n]; });
    try {
      fs.mkdirSync(path.dirname(cachePath()), { recursive: true });
      const keep = Object.entries(cache).slice(-2000);
      fs.writeFileSync(cachePath(), JSON.stringify(Object.fromEntries(keep)), { mode: 0o600 });
    } catch { /* キャッシュ書込失敗は無視 */ }
  }
  return keys.map((k) => cache[k]);
}

export function cosine(a, b) {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return d / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

// スコア: 担当ごとに「プロフィール文」と「ラベル付き例」の最大類似度。信頼度は softmax(score / T) の top1 確率
const TEMP = 0.05;
export function scoreAgents(taskVec, profileVecs, exampleVecs) {
  const scores = {};
  for (const a of AGENTS) {
    let best = cosine(taskVec, profileVecs[a]);
    for (const e of exampleVecs) if (e.agent === a) best = Math.max(best, cosine(taskVec, e.vec));
    scores[a] = best;
  }
  const exps = AGENTS.map((a) => Math.exp(scores[a] / TEMP));
  const z = exps.reduce((s, x) => s + x, 0);
  const probs = Object.fromEntries(AGENTS.map((a, i) => [a, exps[i] / z]));
  const ranked = [...AGENTS].sort((x, y) => scores[y] - scores[x]);
  return { route: ranked[0], confidence: probs[ranked[0]], scores, probs, second: ranked[1] };
}

// X（x.com / twitter.com）の URL を含むカードは grok 固定。codex はネットワーク遮断で X を読めず失敗する（2026-10 b-9503a3ab20）。
// 埋め込みの判定より先に決める（ollama が使えなくても決まる）。
const X_URL_RE = /https?:\/\/(?:[a-z0-9-]+\.)*(?:x\.com|twitter\.com|fxtwitter\.com|vxtwitter\.com|fixupx\.com)(?:[/?#\s]|$)/i;
export const hasXUrl = (text) => X_URL_RE.test(String(text || '').normalize('NFKC'));
export const forcedRoute = (text) => (hasXUrl(text) ? 'grok' : null);

export async function routeTask(text, { model = EMBED_MODEL } = {}) {
  const forced = forcedRoute(text);
  if (forced) return { route: forced, confidence: 1, scores: {}, probs: { [forced]: 1 }, second: null, forced: 'x-url' };
  const examples = loadExamples();
  const profTexts = AGENTS.map((a) => PROFILES[a]);
  const vecs = await embedAll([text.slice(0, 1500), ...profTexts, ...examples.map((e) => e.text)], model);
  const taskVec = vecs[0];
  const profileVecs = Object.fromEntries(AGENTS.map((a, i) => [a, vecs[1 + i]]));
  const exampleVecs = examples.map((e, i) => ({ agent: e.agent, vec: vecs[1 + AGENTS.length + i] }));
  return scoreAgents(taskVec, profileVecs, exampleVecs);
}
