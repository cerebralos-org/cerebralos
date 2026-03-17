---
# CerebraLOS 指令參考

> 所有 `cerebralos` 指令的快速參考。
> 如需概念性文件，請參閱 [ARCHITECTURE.md](ARCHITECTURE.md)。

---

## 情況 → 指令

| 我想... | 指令 |
|-------------|---------|
| 首次啟動 | `cerebralos init` |
| 連接 Claude Code / Cursor | `cerebralos setup --auto` |
| 執行今晚的記憶鞏固 | `cerebralos sleep` |
| 查看今早的洞察 | `cerebralos wake` |
| 搜尋我依稀記得的內容 | `cerebralos recall "..."` |
| 以互動方式瀏覽我的大腦 | `cerebralos explore` |
| 匯入舊的 ChatGPT 對話 | `cerebralos import --from conversations.json` |
| 匯入 Obsidian 庫 | `cerebralos import --from ~/ObsidianVault` |
| 在終端機開啟時自動顯示洞察 | `cerebralos hook` |
| 透過 MCP 連接 | `cerebralos mcp` |

---

## `cerebralos init`

初始化您的大腦目錄。

```bash
cerebralos init           # ~/.cerebralos/ (預設)
cerebralos init --local   # ./.cerebralos/ 在目前目錄中
```

**建立：**
```
~/.cerebralos/
├── core/           長期記憶 (決策、身份、指令)
├── peripheral/     短期記憶 (近期上下文、會話筆記)
├── dreams/         從睡眠作業中合成的洞察
└── archive/
    ├── compressed/ 淡化的記憶 — 僅精要，仍可回憶
    └── frozen/     休眠的記憶 — 不再回憶
```

---

## `cerebralos sleep`

執行主動遺忘 + 夢境鞏固。

```bash
cerebralos sleep
```

**第一階段 — 主動遺忘：**

| 年齡 | 發生什麼事 |
|-----|-------------|
| 0–30 天 | 留在 `core/` 或 `peripheral/` — 完整細節 |
| 30–90 天 | 壓縮到 `archive/compressed/` — LLM 提取精要 |
| 90+ 天 | 移至 `archive/frozen/` — 不再回憶 |

標記為 `#pinned` 的檔案會受到保護，免於所有遺忘。

**第二階段 — 夢境鞏固：**
- 讀取近期記憶
- 呼叫 LLM 以尋找不明顯的連結
- 將夢境儲存到 `dreams/YYYY-MM-DD.md`
- 使用「晨間洞察」更新 `dreams/latest.md`

**LLM 配置** (`~/.cerebralos/.brain/config.json`)：

```json
{
  "llm": {
    "provider": "gemini",
    "model": "gemini-2.5-flash",
    "api_key_env": "GEMINI_API_KEY"
  ",
  "active_forgetting": {
    "compress_threshold_days": 30,
    "freeze_threshold_days": 90,
    "protected_tags": ["pinned", "project"]
  }
}
```

**支援的供應商：** `gemini` | `claude` | `openai` | `github-actions` | `none`

---

## `cerebralos wake`

顯示昨晚夢境的晨間洞察。

```bash
cerebralos wake
```

**輸出：**
```
☀  早安。當您睡覺時，我記住了一些事情。

  您一直在並行運行的兩個專案共享相同的
  潛在問題 — 上下文，而不是計算，是瓶頸。

  (來自 2026-03-17 — 執行 `cerebralos sleep` 再次作夢)
```

如果尚無夢境，則靜默返回 (零 UI)。

---

## `cerebralos recall <query>`

使用 TF-IDF 模式補齊搜尋記憶。

```bash
cerebralos recall "authentication architecture"
cerebralos recall "why we switched to postgres"
cerebralos recall "Q1 goals"
```

**輸出：**
```
回憶：「authentication architecture」...

  ✦ 有東西浮現了。

  1. core/auth-decisions.md
  ● 3 天前
     我們選擇 JWT 而非會話，因為...

  2. archive/compressed/old-auth-notes.md
  ◌ 2 個月前 — 淡化
     認證重寫討論。關鍵決策：無狀態令牌...
```

**結果中的記憶層級：**
- `●` 活躍 — 完整片段 (200 字元)
- `◌ faded` — 壓縮片段 (120 字元)，細節已衰減
- 休眠記憶從不出現

---

## `cerebralos setup`

將 AI 代理連接到您的大腦。

```bash
cerebralos setup                      # 顯示要複製貼上的規則
cerebralos setup --auto               # 自動寫入到所有偵測到的代理
cerebralos setup --agent claude-code  # 指定一個代理
cerebralos setup --agent cursor --auto
```

**自動偵測：** Claude Code, Cursor, Windsurf

**它做什麼：**
- 生成整合規則，指示代理將會話摘要寫入 `peripheral/`
- 使用 `--auto`：直接寫入代理配置檔案
  - Claude Code → `~/.claude/CLAUDE.md`
  - Cursor → `.cursorrules`
  - Windsurf → `.windsurfrules`
- 使用 `<!-- cerebralos-integration -->` 標記 — 可安全地重新運行 (原地更新，無重複)

---

## `cerebralos import`

將外部記憶匯入 `peripheral/imported/`。

```bash
cerebralos import --from ~/Downloads/conversations.json   # ChatGPT 匯出
cerebralos import --from ~/notes/decisions.md             # 單一 Markdown
cerebralos import --from ~/ObsidianVault                  # 整個庫
cerebralos import --from ./log.json --type chatgpt        # 強制類型
```

**自動偵測類型：**

| 副檔名 / 路徑 | 偵測為 |
|-----------------|-------------|
| `.json` | `chatgpt` |
| `.md` | `markdown` |
| 目錄 | `folder` (遞迴匯入所有 `.md`) |

匯入後，執行 `cerebralos sleep` 以整合到您的大腦中。

---

## `cerebralos hook`

安裝零 UI shell 鉤子。

```bash
cerebralos hook
```

將 `cerebralos wake` 附加到 `~/.zshrc` 或 `~/.bashrc`。
每個新的終端機會話將自動顯示您的晨間洞察。

---

## `cerebralos mcp`

啟動 MCP 伺服器以進行 AI 代理整合。

```bash
cerebralos mcp   # 由代理主機呼叫，而非直接呼叫
```

**MCP 配置：**
```json
{
  "mcpServers": {
    "cerebralos": {
      "command": "cerebralos",
      "args": ["mcp"]
    }
  }
}
```

**公開工具：**

| 工具 | 描述 |
|------|-------------|
| `search_memory(query)` | 在核心記憶中搜尋實體或概念 |
| `recall_context(query)` | 回憶特定實體的完整上下文 |
| `write_memory(content, filename?)` | 將記憶寫入 `peripheral/` |

`write_memory` 是 MCP 連接的代理儲存其會話摘要的方式。
如果存在同名檔案，內容將被附加 (而非覆寫)。

---

## `cerebralos explore`

互動式 TUI 瀏覽器。

```bash
cerebralos explore
```

使用 `↑↓` 導航，使用 `Enter` 選擇，使用 `q` 退出。

---

## 記憶檔案格式

以 Markdown 格式編寫記憶。結構靈活，但以下格式效果良好：

```markdown
# 專案名稱或主題
*2026-03-17*

## 發生了什麼
- 建立 cerebralos setup 指令
- 驗證兩階段遺忘功能正常

## 決策
- 使用 Gemini 2.5 Flash 作為預設 LLM 供應商

## 待解決問題
- 休眠記憶是否應該手動解凍？
```

儲存到：
- `~/.cerebralos/core/` — 用於長期、穩定的知識
- `~/.cerebralos/peripheral/` — 用於近期上下文、會話筆記

在檔案中任何位置使用 `#pinned` 標籤以保護其免於遺忘。
