# colab-video: MiniMax H3 を Colab H100 でヘッドレス生成する

> dispatch の担当 `colab_video` は `../colab-video.js` がこのフォルダの `h3_generate.py` を VM へ送って動かす（H100 → だめなら A100、二重起動防止、完了は出力 JSON の有無で判定、必ず `colab stop`）。

テキスト（日本語可）から、音声付きの mp4 を MiniMax H3 で生成する。Google Colab の H100 80GB 1 枚を使い、ブラウザは開かない。
Mac mini から公式 Colab CLI（`google-colab-cli`）で VM を借りて実行し、終わったら返却する。

- 生成方式: ComfyUI（v0.39.0 に固定）をヘッドレスで起動し、`/prompt` API にワークフローを投入する。完了は `/ws` で待つ
- ワークフロー: ComfyUI 公式ブループリント「Image to Video (MiniMax H3)」を API 形式に書き直したもの。最初と最後のフレーム画像を渡さないので、t2va（テキスト→映像+音声）として動く
- 重み: Hugging Face の `Comfy-Org/MiniMax-H3`（gated ではないので HF トークンは不要）

| ファイル | 役割 |
|---|---|
| `h3_generate.py` | VM 上で動く本体。事前チェック → 重み DL と ComfyUI 導入を並列実行 → 生成 → mp4 と JSON を出力 |
| `run_h3_colab.sh` | Mac 側のドライバ。`colab new` → upload → バックグラウンドで起動 → ポーリング → download → `colab stop` |
| `workflow_t2va_api.json` | 参考用の API 形式ワークフロー（`--dump-workflow` で生成。プロンプト欄は `<PROMPT>`） |

---

## 1. 事前準備（Mac mini、初回のみ）

```bash
uv tool install google-colab-cli        # または pip install google-colab-cli（Python 3.12+）
# 認証（ADC 推奨。公式 SKILL.md にあるスコープ指定）
gcloud auth application-default login \
  --scopes=openid,https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/userinfo.email,https://www.googleapis.com/auth/colaboratory
colab sessions                           # 認証確認（読み取りのみ。VM は作らない）
```

- H100 と `--high-mem` は Colab Pro / Pro+ の契約と残り CU 次第で使える。足りないと `colab new` が 400 や 412 で失敗する
- このフォルダはリポジトリの `src/dispatch/colab/` に同梱（dispatch の担当 colab_video が `colab-video.js` から使う。手動実行は下のドライバ）

## 2. 1 本試す（推奨: ドライバで分割実行する）

```bash
cd ~/cerebralos-local/src/dispatch/colab
./run_h3_colab.sh -o ./outputs/test1.mp4 -- \
  --prompt "夕暮れの海辺。若い女性が振り返って「また明日ね」と微笑む。波の音とやわらかいピアノ。" \
  --seconds 5 --seed 42
```

- 出力: `outputs/test1.mp4`、`outputs/test1.json`（所要時間・ピーク VRAM・使ったチェックポイント）、`outputs/test1.run.log`
- 失敗すると `*.comfyui.log` と `*.install.log` も取得し、終了コードは 0 以外になる。VM は終了時に必ず `colab stop` する（`--keep` を付けたときを除く）
- 早く回すなら `--turbo` を付ける（公式の 8 ステップ turbo LoRA を使う）。ただし公式ドキュメントによると、セリフの音質は 12 ステップ以上が目安
- 低解像度で通しテストするなら `--size 480p`

### ドライバが内部で実行していること（手で打つ場合も同じ）

```bash
S=h3test
colab new -s $S --gpu H100 --high-mem
colab upload -s $S h3_generate.py /content/h3_generate.py
# 生成は VM 上でバックグラウンド起動する（長い websocket 接続や exec のタイムアウトに依存しないため）
cat <<'PY' | colab exec -s $S --timeout 120
import subprocess, sys, os
os.makedirs("/content/h3_out", exist_ok=True)
p = subprocess.Popen([sys.executable, "-u", "/content/h3_generate.py",
                      "--prompt", "夕暮れの海辺。…", "--seconds", "5", "--seed", "42",
                      "--out", "/content/h3_out/a.mp4"],
                     stdout=open("/content/h3_out/run.log", "w"), stderr=subprocess.STDOUT,
                     start_new_session=True)
print(p.pid)
PY
# 進捗確認（数十秒おきに繰り返す。state が done か failed になるまで）
echo 'print(open("/content/h3_out/a.mp4.status.json").read()); print(open("/content/h3_out/run.log").read()[-1500:])' \
  | colab exec -s $S
colab download -s $S /content/h3_out/a.mp4  ./a.mp4
colab download -s $S /content/h3_out/a.json ./a.json
colab stop -s $S
```

## 3. `colab run` 一発方式（代替）

```bash
colab run --gpu H100 --high-mem --keep -s h3run --timeout 10800 \
  h3_generate.py --prompt "夕暮れの海辺…" --seconds 5 --seed 42 --out /content/h3_out/a.mp4
colab download -s h3run /content/h3_out/a.mp4 ./a.mp4
colab download -s h3run /content/h3_out/a.json ./a.json
colab stop -s h3run
```

この方式には注意点が 3 つある。いずれも CLI のソース（`src/colab_cli/commands/run.py`）で確認した。

- **`colab run` は出力ファイルを回収しない。** スクリプトが終わるとすぐ VM を返却する。README には「retrieve output files」とあるが、実装にその処理はない。だから `--keep` を付けて残し、`colab download` → `colab stop` を自分で実行する。`--keep` を付け忘れると mp4 は VM ごと消える
- **`--timeout` の既定値は 30 秒**（実行の待ち時間）。ここでは長めに指定する
- **スクリプトはカーネル内で丸ごと 1 セルとして動く。** 30〜60 分の間 websocket を張り続けることになる。途中で接続が切れると `colab run` は失敗扱いになる。`--keep` が無いと、その時点で VM ごと止まる

このため、確実性はドライバ（第 2 節の分割方式）の方が高い。`h3_generate.py` は torch を自プロセスで import しないので、カーネル内で実行しても torch の入れ替えとぶつからない。

---

## 4. `h3_generate.py` の引数

| 引数 | 既定値 | 内容 |
|---|---|---|
| `--prompt` / `--prompt-file` | 必須 | 日本語のまま渡す（翻訳しない）。ドライバに `--prompt-file` を渡すと、ローカルで読み込んで中身を送る |
| `--seconds` | 5 | 4〜15 秒。モデルのフレーム格子 17k+5 に切り上げる（5 秒→124 フレーム、15 秒→362 フレーム、24fps） |
| `--size` | `768p` | `768p` は 1344x768。他に `768p-portrait`、`768p-square`、`480p`、または `WxH`（32 の倍数、面積は 768×1344 以下） |
| `--seed` | ランダム | 使った値を JSON に記録する |
| `--out` | `/content/h3_out/h3.mp4` | VM 上の出力パス。JSON は同じ名前の `.json`、進捗は `.mp4.status.json` |
| `--steps` | 20（turbo 時は 8） | 公式の目安: 基本 20 / 単純な絵なら 12〜16 / 細部重視なら最大 50 程度 |
| `--turbo` | オフ | `minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16` を読み込む（+1.96GB） |
| `--variant` | `auto` | DiT の精度。`auto` は torch が cu130 なら int8_convrot、そうでなければ fp8_scaled。`bf16` は 40GB |
| `--text-encoder` | `nvfp4` | Qwen3-VL-32B。`nvfp4_awq`（15.7GB、ブループリントの既定。Blackwell でなくても動く）か `int8`（27.1GB） |
| `--torch` | `auto` | 今の torch が CUDA 13 でなく、ドライバが 580.65 以上なら cu130 版を入れる。`keep` で入れ替えない |
| `--comfy-ref` | `v0.39.0` | ComfyUI のタグ。H3 には 0.30.0 以上が必要 |
| `--models-dir` | `<comfy>/models` | 重みの置き場所（キャッシュ流用向け。第 6 節を参照） |
| `--hf-revision` | 検証済みコミット `e5eb578…` | `main` にすると最新ファイルを使う（ファイル名が変わると 404 になる） |
| `--comfy-args` | なし | ComfyUI に渡す追加引数。例: `--use-ck-attention`（0.32+ で使える。今回は未検証なので既定ではオフ） |
| `--dump-workflow PATH` | — | ワークフロー JSON を書き出すだけ。GPU も DL も使わない |

### 取得するファイル（既定の int8 構成、合計 約 42.5GB）

| ComfyUI フォルダ | ファイル | サイズ |
|---|---|---|
| `diffusion_models/` | `minimax_h3_fl2va_pruned_int8_convrot.safetensors` | 20.97GB |
| `text_encoders/` | `qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors` | 15.69GB |
| `vae/` | `minimax_h3_video_vae_fp16.safetensors` | 5.21GB |
| `vae/` | `minimax_h3_audio_vae_fp32.safetensors` | 0.61GB |

合計 42.5GB は、Comfy 公式ブログの「最小構成で 42.5 GB」と一致する。ファイル名とサイズは HF API で確認した（2026-10-13）。

### 出力 JSON の主な項目
`ok`、`out`、`checkpoints`、`timings_s`（`download_and_install_wall`、`install`、`comfy_start`、`comfy_total`、`phases`、`per_node`、`total`）、`vram_peak_mib`（nvidia-smi で見た使用量のピーク）、`seed`、`frames`、`width`、`height`、`torch`、`comfyui_version`、`ffprobe`、失敗時は `error` と `exit_code`。

- `phases` の内訳は、load（ローダーノード）、text_encode（Qwen3-VL を GPU に載せる時間を含む）、sample（DiT を GPU に載せる時間＋全ステップ）、decode、mux
- ComfyUI はモデルを必要になった時点で GPU に載せるので、「ロード」と「生成」の境界は完全には分けられない

### 終了コード
0 成功 / 2 引数不正 / 3 事前チェック失敗（GPU・ディスク・ドライバ）/ 4 インストール失敗 / 5 DL 失敗 / 6 ComfyUI 起動失敗 / 7 ワークフロー拒否（ノード不足・ファイル不可視・検証エラー）/ 8 生成中のエラー / 9 mp4 がない、または映像か音声のストリームが欠けている

---

## 5. 所要時間の目安（未計測の推定。初回の JSON で実測値に置き換える）

| 区間 | 推定 | 根拠とメモ |
|---|---|---|
| VM 確保 | 1〜3 分 | H100 の空き状況次第 |
| 重み DL（42.5GB） | 3〜10 分 | `HF_XET_HIGH_PERFORMANCE=1` で 4 ファイルを並列取得。Colab と HF の間の帯域次第 |
| torch cu130＋ComfyUI 依存（DL と並列） | 2〜4 分 | torch の入れ替えが必要な場合 |
| ComfyUI 起動 | 0.5〜1 分 | |
| ロード＋生成（5 秒・1344x768・20 ステップ） | 5〜15 分 | 33B の DiT。H100 での公式ベンチマークは見つからなかった |
| 同上（`--turbo` 8 ステップ） | 3〜6 分 | |
| **合計** | **約 15〜35 分/本** | 毎回まっさらな VM なので、DL とインストールは毎回かかる |

ボトルネックは次の 2 つ。
- **毎回の重み DL 約 42GB**: 複数本を作るなら、1 つの VM で連続生成するのが一番効く。`--keep` で VM を残し、`colab exec` で `h3_generate.py` を 2 本目、3 本目と実行すれば、DL は 2 回目以降スキップされる（既存ファイルを検出する）
- **DiT のサンプリング**: ステップ数と秒数にほぼ比例する。15 秒は 5 秒の約 3 倍以上かかる見込み

## 6. DL 短縮策の検討

- **HF 直接取得（採用）**: Xet ストレージを高性能モードで使う。`hf_transfer` は廃止され、`HF_HUB_ENABLE_HF_TRANSFER` は無視されるので使わない。必要な 4 ファイルだけを個別に取得し、bf16 版や ref2va など不要な 300GB 超は取らない
- **Google Drive キャッシュ（非推奨）**
  - `colab drivemount` は対話式で、人が端末にいる必要がある（公式 SKILL.md）。無人実行には組み込めない
  - Drive に 42.5GB の空きが必要（無料枠 15GB では足りない）
  - Drive FUSE 経由の読み込みは、HF 直接取得より速いとは限らない
  - **注意**: Mac 側の Google Drive がミラーモードだったり、そのフォルダを開いたりすると、42GB がローカルに落ちる（2026-09-22 のディスク 100% 事故と同じ構図）。使うなら「マイドライブ直下ではない専用フォルダ」で、Mac 側では触らない
  - 使う場合の手順: `colab drivemount -s $S` を手で実行してから、`--models-dir /content/drive/MyDrive/h3_models` を指定する
- **同じ VM で連続生成（推奨）**: 上のボトルネックの項を参照

## 7. 認証情報とトークン

- `Comfy-Org/MiniMax-H3` は gated ではないので、HF トークンは不要（HF API の `gated: false` を確認済み）
- 将来 gated になった場合: `h3_generate.py` は環境変数 `HF_TOKEN` を読む
  - `colab exec --env` や `colab run --env HF_TOKEN=...` で渡す方法は使わない。値がコードの前置きに埋め込まれ、Mac 側の `~/.config/colab-cli/history/*.jsonl` に平文で残る（CLI ソースで確認）
  - より安全な方法: 読み取り専用の fine-grained トークンを作り、ローカルの一時ファイル経由で VM に置く。`huggingface_hub` は `~/.cache/huggingface/token` を自動で読む。VM は使い終わると破棄され、トークンも使い終わったら失効させる
    ```bash
    colab upload -s $S ./hf_token.txt /root/.cache/huggingface/token
    rm ./hf_token.txt
    ```

## 8. ライセンスと公開時の注意

- MiniMax H3 は **MiniMax H3 Community License** で提供されている。利用前に HF の `MiniMaxAI/MiniMax-H3` にある LICENSE と License Q&A を確認する
- ComfyUI 公式ドキュメントには「ローカル生成物の商用利用には MiniMax の商用ライセンスが必要（Comfy 経由で取得可能）」とある。仕事で使う前に必ず確認する
- **生成物を公開するときは、AI 生成であることを必ず明示する**（X・note・YouTube の説明欄など）
- 実在の人物に似せたり、声を真似たりする生成はしない

## 9. トラブルシュート

- `colab new` が 400 / 412 で失敗する: H100 の権限・空き・CU が不足している。時間を置くか、`--gpu A100` を試す（A100 80GB なら同じ構成で動く見込み。40GB 版は厳しい）
- 終了コード 7 で `ComfyUI lacks required nodes` が出る: `--comfy-ref` が古い
- 終了コード 7 で `node_errors` が出る: ノードの入力名が変わった可能性がある。`_work/workflow_api.json` と ComfyUI の `/object_info` を見比べる
- 終了コード 5 で 404 が出る: HF 側のファイル名が変わった。`--hf-revision main` を試し、`CKPT` のファイル名を直す
- int8 で読み込みエラーが出る: `--variant fp8` で再実行する（fp8_scaled は int8_convrot が使えないときの代替。HF のモデルカードによる）

## 出典（2026-10-13 確認）
- Colab CLI: https://github.com/googlecolab/google-colab-cli （README、docs/05_run_command.md、skills/colab-operator/SKILL.md、src/colab_cli/commands/run.py）
- 重み: https://huggingface.co/Comfy-Org/MiniMax-H3 / 原本: https://huggingface.co/MiniMaxAI/MiniMax-H3
- ComfyUI ノード: https://github.com/Comfy-Org/ComfyUI/blob/v0.39.0/comfy_extras/nodes_minimax_h3.py
- 公式ブループリント: https://github.com/Comfy-Org/ComfyUI/blob/v0.39.0/blueprints/Image%20to%20Video%20(MiniMax%20H3).json
- チュートリアル: https://docs.comfy.org/tutorials/video/minimax/minimax-h3
- Day-0 ブログ: https://blog.comfy.org/p/minimax-h3-day-0-support-in-comfyui
- HF Xet 高性能モード: https://huggingface.co/docs/huggingface_hub/main/en/concepts/migration
