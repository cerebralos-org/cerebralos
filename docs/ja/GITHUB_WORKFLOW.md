# CerebraLOS オンボーディングガイド（GitネイティブなAIの脳の作り方）

CerebraLOSは「Gitネイティブ」に設計されています。つまり、AIの潜在意識（記憶）を**GitHubのプライベートリポジトリ**で管理するのが最も美しい使い方です。

これにより、PCを買い替えても記憶を引き継げますし、AIの思考の進化をGitの履歴として追うことができます。

このガイドでは、あなたのAIのための「脳（リポジトリ）」を作り、各AIを接続するまでの流れを解説します。

---

## 1. AIの「脳」となるリポジトリを作る

まずは、GitHub上にAIの記憶を保存するための専用リポジトリを作成します。

### 手順
1. GitHubで新しい**Private**リポジトリを作ります（例：`my-ai-brain`）。
   *※AIの思考ログには機密情報が含まれる可能性があるため、必ずPrivateにしてください。*
2. リポジトリを初期化する際、「Add a README file」にチェックを入れておくとスムーズです。

---

## 2. ローカルPCに「脳」をクローンする

次に、作成したリポジトリをあなたのPC（ローカル環境）に同期させます。

### 手順
ターミナルを開き、以下のコマンドを実行します：

```bash
# ホームディレクトリなど、わかりやすい場所に移動
cd ~

# リポジトリをクローン
git clone https://github.com/YOUR_USERNAME/my-ai-brain.git

# クローンしたディレクトリに移動
cd my-ai-brain
```

これで、あなたのPC上に `~/my-ai-brain` という「AIの脳」の実体ができました。

---

## 3. CerebraLOSのディレクトリ構造を作る

クローンしたリポジトリの中に、CerebraLOSが使用する2つの重要なディレクトリを作成します。

```bash
# ディレクトリの作成
mkdir peripheral
mkdir dreams

# .gitignoreの作成（重要！）
cat << EOF > .gitignore
# ❌ 無視する：日々の雑多なログや一時的な記憶
peripheral/

# ✅ コミットする：蒸留された「夢」と「コア記憶」
!dreams/
!core/

# ❌ 無視する：一時ファイルやAPIキー
tmp/
.env
EOF

# 変更をコミットしてプッシュ
git add .
git commit -m "chore: initialize CerebraLOS directories"
git push origin main
```

### なぜこうするのか？
- **`peripheral/`（周辺記憶）**：AIが今日やった作業の生ログです。これは寝る（Sleep Job）と消える運命にあるので、Gitにはコミットしません。
- **`dreams/`（夢）**：寝ている間に、生ログから抽出された「本質的な気づき」です。これこそがAIの成長の証なので、Gitにコミットして残します。

---

## 4. AIエージェントを接続する

準備が整いました。あとは、あなたの使っているAIエージェントをこの「脳」に接続するだけです。
接続方法は、AIのタイプによって大きく2つに分かれます。

### パターンA：ローカル同期型（CLI系・ローカルLLM）
*対象：Claude Code, Aider, OpenClaw, Cursorなど*

これらのAIは、あなたのPCのローカルファイルシステムに直接アクセスできます。
したがって、**先ほどクローンしたローカルの `~/my-ai-brain` フォルダを直接読み書きさせます。**

**設定例（Claude Codeの場合）：**
`.clauderc` に以下のルールを追記します。
```markdown
# CerebraLOS Integration
- 新しいタスクを始める前に、必ず `~/my-ai-brain/dreams/latest.md` を読むこと。
- 重要なマイルストーンを達成したら、その要約を `~/my-ai-brain/peripheral/claude_code.md` に書き込むこと。
```

### パターンB：GitHub連携型（Web系）
*対象：Manus, GitHub Copilot (Web) など*

これらのAIはクラウド上で動いているため、あなたのPCのローカルフォルダにはアクセスできません。
代わりに、**GitHubのコネクター（APIやOAuth連携）を通して、リモートの `my-ai-brain` リポジトリを直接操作させます。**

**設定例（Manusへのプロンプト）：**
> 「このプロジェクトでは、長期記憶の管理にGitHubリポジトリ `my-ai-brain` を使用してください。
> 1. コンテキストを把握するために `my-ai-brain/dreams/latest.md` を読んでください。
> 2. 作業の進捗は `my-ai-brain/peripheral/manus_log.md` にコミットしてプッシュしてください。」

---

## 5. GitHub Actionsで「睡眠」を自動化する

ここからがCerebraLOSの真骨頂です。
毎日手動でログを整理するのは面倒ですよね。**GitHub Actionsを使って、毎晩AIを自動で寝かせましょう。**

### 設定方法
`~/my-ai-brain/.github/workflows/sleep-job.yml` というファイルを作り、以下をコピペします：

```yaml
name: CerebraLOS Nightly Sleep Job

on:
  schedule:
    # 毎日UTCの午前3時（日本時間の昼12時）に実行
    - cron: '0 3 * * *'
  workflow_dispatch: # 手動実行ボタンも有効化

jobs:
  dream:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Run CerebraLOS Sleep Job
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }} # LLMを動かすためのキー
        run: npx cerebralos sleep

      - name: Commit Dreams
        run: |
          git config --global user.name "CerebraLOS Bot"
          git config --global user.email "bot@cerebralos.local"
          git add dreams/
          # 変更があった時だけコミットする
          git diff --quiet && git diff --staged --quiet || (git commit -m "chore(memory): nightly dream consolidation" && git push)
```

### ⚠️ 最後にAPIキーを登録する
GitHub ActionsがLLMを叩けるように、リポジトリのSettingsにAPIキーを登録します。
1. GitHubの `my-ai-brain` リポジトリを開く
2. **Settings** > **Secrets and variables** > **Actions** をクリック
3. **New repository secret** をクリック
4. Nameに `OPENAI_API_KEY` と入力
5. ValueにあなたのAPIキーを貼り付けて保存

---

### これで何が起きるか？

あなたが寝ている間（または指定した時間）に、GitHub Actionsが自動で起動します。
その日の雑多なログ（Peripheral）を読み込み、LLMを使って「夢（Dreams）」に蒸留し、それを自動でコミットしてくれます。

翌朝、あなたが `cd ~/my-ai-brain && git pull` を実行すると、**昨日より少し賢くなったAIの脳**がそこにあります。
