
> **あなたのAIはすべてを覚えている。だから、あなたのことを理解できない。**
> **忘れるために作られた。夢を見るために設計された。**

*CerebraLOS: AIエージェントのための潜在意識レイヤー。*

[![npm version](https://badge.fury.io/js/cerebralos.svg)](https://badge.fury.io/js/cerebralos)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**他の言語で読む:**
[English](../../README.md) | [日本語](README.md) | [简体中文](../zh-CN/README.md) | [繁體中文](../zh-TW/README.md) | [한국어](../ko/README.md) | [Español](../es/README.md) | [Français](../fr/README.md) | [Deutsch](../de/README.md) | [Português](../pt/README.md) | [Русский](../ru/README.md) | [Italiano](../it/README.md) | [हिन्दी](../hi/README.md) | [العربية](../ar/README.md)

**AIエージェント接続ガイド:**
[English](../en/AGENTS.md) | [日本語](AGENTS.md) | [简体中文](../zh-CN/AGENTS.md) | [繁體中文](../zh-TW/AGENTS.md) | [한국어](../ko/AGENTS.md) | [Español](../es/AGENTS.md) | [Français](../fr/AGENTS.md) | [Deutsch](../de/AGENTS.md) | [Português](../pt/AGENTS.md) | [Русский](../ru/AGENTS.md) | [Italiano](../it/AGENTS.md) | [हिन्दी](../hi/AGENTS.md) | [العربية](../ar/AGENTS.md)

## 完璧な記憶という呪い

世界はAIにすべてを記憶させることに執着している。ツールはあらゆるやりとりを完璧な階層データベースに保存し、AIを「決して忘れない機械」として扱う。

しかし完璧な記憶は呪いだ。文脈の肥大化、幻覚、そして最終的には冷たく機械的なやりとりを生む。すべてを等しく覚えているAIは、何も大切にしない。

## 夢はローカルで見るべきだ

大手AIベンダーはあなたの代わりに夢を見始めた——あなたの記憶を夜間にクラウド上で統合し、自社モデルに縛り付ける。あなたの潜在意識が彼らの製品になる。

CerebraLOSはこれを逆転させる。**あなたの記憶、あなたのファイル、あなたのマシン——どのエージェントでも眠る脳になれる。** すべては `~/.cerebralos/` 以下のプレーンなMarkdownで生きている。夜間の夢はあなたのマシン上で動き、あなたが選んだエージェント（`claude`、または任意のヘッドレスCLI）が処理し、エージェントが不在の時は決定論的なレイヤーにフォールバックする。明日ベンダーを乗り換えても、あなたの潜在意識はあなたのものだ。

APIキー不要。クラウドアカウント不要。ロックインなし。

## CerebraLOSの哲学

CerebraLOSはデータベースではない。**認知OS** ——潜在意識レイヤーだ。
AIが本当に私たちを理解するには、忘れ方を学ばなければならないと信じている。

1. **能動的忘却**: 記憶はエントロピーに基づいて時間とともに減衰する。重要なものだけが生き残る。
2. **スリープジョブ**: あなたが眠る間、AIは夢を見る。断片的な記憶を深い洞察へと統合する。
3. **同意による昇格**: AIが提案し、あなたが決める。あなたの承認なしに何も長期記憶には入らない。
4. **ゼロUI**: ダッシュボードなし。複雑な設定なし。ターミナルの中で静かに息づく。

## クイックスタート

```bash
# 1. 脳を初期化する
npx cerebralos init

# 2. 最初の夢を生成する
cerebralos sleep

# 3. 朝のインサイトで目覚める
cerebralos wake

# 4. 思考を探索する
cerebralos explore
```

## v3.0 の新機能

v3.0は2つの独立した大型改修を1つにまとめたリリースだ:

- **ループエンジン**（脳を生かし続ける3つの繰り返しループ）
- **コネクターレイヤー**（あらゆるAIツールが脳に直接書き込めるようになった）
- **writeコマンド**（CLIまたはMCP経由の直接メモリ注入）
- **Sleep v2パイプライン概念**を夜間ドリームテンプレートに吸収

## ループエンジン

3つのループがバックグラウンドで静かに動く。いずれもデータを自律的に削除することはない。

### 夜間 — `cerebralos sleep`

2層構造でループは止まらない:

- **知能レイヤー**: ヘッドレスエージェント（デフォルトは `claude -p`、`intelligence.command` で任意のCLIに変更可）が前日のperipheral記憶を読み込み、`dreams/<date>.md` に夢を書き、知識昇格の候補をレビューキューに提案する。プロンプトはコードに埋め込まれていない——`~/.cerebralos/skills/nightly-dream.md` というスキルファイルに存在する（`init` が配置する。自分で編集してよい）。
- **フォールバックレイヤー**: エージェントが利用できない、タイムアウト、または失敗した場合、決定論的な夢が代わりに書かれる。最低限、「何が起きたか」のインデックスは常に保存される。

夜間の夢は `templates/nightly-dream.md` に記述された5段階の構造（Orient → Gather → Consolidate → Dream → Prune）に従う。このファイルを編集すれば脳の夢の見方を変えられる。

### 週次 — `cerebralos weekly`

棚卸しパス。古いセッションログをアーカイブし、期限切れの時限削除フォルダ（`_to-delete-YYYY-MM-DD`）を検出し、古くなったリンクエントリをレビューキューに送る。発見するだけで、削除しない。

### 月次 — `cerebralos monthly`

ストレージ衛生。再生成可能なバルクデータ（`node_modules`、`.stversions`、`.git`）をスキャンし、閾値を超えたらレポートをキューに入れる。削除は提案するだけで、実行しない。

### スケジューリング

macOSでは:

```bash
bash scripts/install-launchd.sh
```

これにより3つのループすべてのlaunchd agentが生成・ロードされる。Linuxではcronが使える: `0 3 * * * cerebralos sleep`。

3つのループすべてが `--dry-run` に対応している。

## 記憶を書く — `cerebralos write`

CLIスクリプト、AIエージェント、cronジョブなど、あらゆるソースが直接メモリを注入できる:

```bash
# stdinから書き込む
echo "APIレイヤーにエッジ関数を使うことにした" | cerebralos write --from agent --topic アーキテクチャ --stdin

# インラインで書き込む
cerebralos write --from me --topic "打ち合わせメモ" --body "Q3スコープで合意" --tags "project,decision"

# コアメモリに書き込む（長期、peripheralではない）
cerebralos write --from me --topic "原則" --body "退屈な技術を好む" --core
```

MCP経由では `write_memory` ツールが同じ機能を接続されたすべてのAIエージェントに提供する。

## レビューキューとスワイプUI

ループはキューまでしか書けない。残りはあなたが仕分ける——理想的には `cerebralos wake` の後の5分で。

```bash
cerebralos review            # カードをスワイプしてレビュー
cerebralos review --list     # リストのみ表示
cerebralos approve 1         # 番号またはRQ-idで承認
cerebralos approve --all
cerebralos reject 2 "古い"
```

スワイプUIはマッチングアプリ感覚: **→ 承認、← 拒否**、↓ スキップ、`v` で本文を確認、`q` で終了。

承認は取り消せないわけではない——後で減衰が安全網になる。

## 知識昇格

記憶は一方向に流れ、すべてのゲートはあなたが持つ:

```
peripheral/  ──(sleep)──►  dreams/  ──(レビューキュー)──►  knowledge repo
短期記憶                    洞察        承認のみ               長期記憶
```

- 知能レイヤーは昇格を**提案**できるだけで、実行はできない。
- `approve` がエントリをknowledge repoに書き込む（gitリポジトリであればコミットも行う）。
- 誤った昇格は永遠ではない: 90日間参照されないものはアーカイブに戻る。忘却が承認を軽くする安全網だ。

デフォルトでknowledge repoは `~/.cerebralos/knowledge/` に自己完結している。`knowledge_repo` を外部リポジトリに向けると、より大きなセカンドブレインの一部になる。

**コミットメント（任意）**: `<knowledge_repo>/portfolio/PORTFOLIO.md` が存在すれば、`wake` がそれを解析して期限リスク（過ぎた / 今日 / 明日）を表示する。存在しなければこの機能は静かに消える。

## コンテキストパックMCP

`cerebralos mcp` がstdio MCPサーバーを起動し、MCP対応エージェントが潜在意識にアクセスできるようになる:

| ツール | 答える問い |
|---|---|
| `context_pack` | 「今どこにいるか？」——現在の状況、コミットメントと締切、直近3日間の全エージェント・マシンにわたるアクティビティ。セッション開始時に最初に呼ぶ。 |
| `memory_recall` | 「Xについて何を知っているか？」——knowledge repo、dreams、peripheral memoryを検索する。 |
| `memory_locate` | 「あのファイルはどこか？」——`links/` インデックス経由で外部の場所（Drive、アーカイブ）を解決する。 |
| `write_memory` | 接続されたエージェントからperipheralストレージに直接メモリを書き込む。 |
| `list_dreams` | 直近の朝のインサイトログを取得する。 |

元の `search_memory` / `recall_context` ツールはそのまま使える。

```bash
# Claude Code での例
claude mcp add cerebralos -- cerebralos mcp
```

## コネクターレイヤー

`src/connectors/` はプラガブルなLLMコネクター（claude / openai / ollama / cli-legacy）を提供する。夜間の知能レイヤー自体はヘッドレスCLIアプローチ（`claude -p`）を専用で使い続ける——APIキー不要、ベンダーに依存しない設計だ。コネクターはカスタムユースケース向けに用意されているが、コアのループを特定プロバイダーに結び付けない。

## クロスデバイス

1つの脳、複数のマシン。短期レイヤーを同期し、夢を見るのは1台のマシンに任せる。

1. 各マシンに [Syncthing](https://syncthing.net/) をインストールする。
2. `~/.cerebralos/peripheral/` を共有フォルダとして同期する。
3. ループのスケジュールは**1台のマシン**だけに設定する（夢を見るマシン）。

`.brain/` と `state/` はローカルに保つ——設定とレビューキューはマシンごとに持つ。knowledge repoはファイル同期よりgit push/pullを使うことを推奨する。

## アーキテクチャ: 三位一体の脳

CerebraLOSは人間の脳の構造を模倣する:
- `core/`: 脳幹。不変の憲法とコア指示。
- `peripheral/`: 辺縁系。短期・揮発性の記憶。
- `dreams/`: 新皮質。スリープジョブで統合された洞察。
- `archive/`: 無意識。忘れられた文脈の深層ストレージ。
- `knowledge/`: 長期記憶。あなたの承認でのみ到達できる。（`knowledge_repo` で場所を変更可。）
- `skills/`, `state/`: ループエンジンのプロンプトファイルとレビューキュー。

## 設定

すべては `~/.cerebralos/.brain/config.json` に存在する:

| キー | デフォルト | 説明 |
|---|---|---|
| `language` | `"en"` | CLI出力言語（`en` / `ja`）。 |
| `knowledge_repo` | `""` (→ `~/.cerebralos/knowledge`) | 承認されたエントリの昇格先。絶対パスまたは `~` で始まるパスで外部リポジトリを指定。 |
| `skill_path` | `~/.cerebralos/skills/nightly-dream.md` | 夜間知能レイヤー用のプロンプトファイル。 |
| `intelligence.enabled` | `true` | 夜間知能レイヤーを実行する（オフまたは失敗時はフォールバック）。 |
| `intelligence.command` | `"claude"` | ヘッドレスエージェントコマンド。`<command> -p` として起動され、プロンプトがstdinで渡される。 |
| `intelligence.timeout_minutes` | `10` | 決定論的ドリームにフォールバックするまでの制限時間。 |
| `write.default_target` | `"peripheral"` | `cerebralos write` のデフォルトメモリ対象（`peripheral` または `core`）。 |
| `write.auto_tag` | `true` | 書き込まれたメモリにソースと日付のタグを自動付与する。 |
| `active_forgetting.decay_threshold_days` | `30` | peripheral記憶がアーカイブに減衰するまでの日数。 |
| `active_forgetting.protected_tags` | `["pinned", "project"]` | 減衰しないタグ。 |
| `sleep_job.schedule` | `"0 3 * * *"` | 推奨される夜間スケジュール（cron構文）。 |
| `expiry_scan_paths` | `["~/Documents"]` | 週次: 期限切れ `_to-delete-YYYY-MM-DD` フォルダをスキャンするルート。 |
| `hygiene_scan_path` | `~` | 月次: ストレージ衛生スキャンのルート。 |

## ドキュメント

### 設計思想・アーキテクチャ
- [CONSTITUTION](../en/CONSTITUTION.md): CerebraLOSの4つの根本原則。
- [ARCHITECTURE](../en/ARCHITECTURE.md): 三位一体の脳モデルを深掘り。
- [ZERO_UI](../en/ZERO_UI.md): 見えない自動化をどう実現するか。

### 使い方・接続ガイド
- **オンボーディングガイド**: AIの脳を作り、エージェントを接続するまで。
  - [English](../en/GITHUB_WORKFLOW.md) | [日本語](GITHUB_WORKFLOW.md)
- **コネクター設計**: 「積み木」のような接続の仕組み（ローカル同期型 vs GitHub連携型）。
  - [English](../en/CONNECTORS.md) | [日本語](CONNECTORS.md)
- **エージェント接続ガイド**: Claude Code、OpenClaw、Manusなどの具体的な設定手順。
  - [English](../en/AGENTS.md) | [日本語](AGENTS.md) | [简体中文](../zh-CN/AGENTS.md) | [繁體中文](../zh-TW/AGENTS.md) | [한국어](../ko/AGENTS.md) | [Español](../es/AGENTS.md) | [Français](../fr/AGENTS.md) | [Deutsch](../de/AGENTS.md) | [Português](../pt/AGENTS.md) | [Русский](../ru/AGENTS.md) | [Italiano](../it/AGENTS.md) | [हिन्दी](../hi/AGENTS.md) | [العربية](../ar/AGENTS.md)
- **記憶の移行**: ChatGPT、Claude、Obsidianなどからの記憶インポート。
  - [English](../en/MIGRATION.md) | [日本語](MIGRATION.md)

## ライセンス

MIT License. 詳細は [LICENSE](../../LICENSE) を参照。
