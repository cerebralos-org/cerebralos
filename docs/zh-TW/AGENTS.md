# CerebraLOS 代理整合指南

CerebraLOS 旨在成為任何 AI 代理的「潛意識層」。它透過充當背景記憶處理器，與您現有的工具無縫協作。

本指南說明如何將 CerebraLOS 連接到流行的 AI 代理。

## 1. Claude Code (Anthropic)

Claude Code 是一個強大的基於 CLI 的 AI 代理。透過將其連接到 CerebraLOS，Claude Code 獲得了「遺忘」不相關上下文並「夢想」一夜之間獲得架構洞察的能力。

### 設定

1. 在您的專案中初始化 CerebraLOS：
   ```bash
   npx cerebralos init
   ```

2. 配置 Claude Code 以讀取 CerebraLOS 的夢境：
   建立或更新您的 `.clauderc` 或專案說明以包含：
   ```markdown
   Before starting any task, ALWAYS read the latest dream insights from `.cerebralos/dreams/latest.md`
   When you finish a significant task, write a brief summary to `.cerebralos/peripheral/context.md`
   ```

3. 執行您的每日睡眠任務 (或設定一個 cron job)：
   ```bash
   npx cerebralos sleep
   ```

## 2. Cursor (AI Code Editor)

Cursor 是最受歡迎的 AI 優先 IDE。CerebraLOS 可以充當其長期架構記憶。

### 設定

1. 在您的專案根目錄中初始化 CerebraLOS。
2. 開啟 Cursor 設定 > 一般 > AI 規則 (或 `.cursorrules` 檔案)。
3. 添加以下規則：
   ```markdown
   # CerebraLOS Integration
   - Always check `.cerebralos/dreams/` for architectural context before proposing large refactors.
   - Do not memorize everything. Rely on CerebraLOS to surface relevant context.
   ```
4. 當您使用 `Cmd+K` 或 `Cmd+L` 時，Cursor 現在將自然地整合您專案中提煉出的「夢境」，而不會被原始日誌淹沒。

## 3. OpenClaw

OpenClaw 是一個強大的自主代理框架。雖然 OpenClaw 專注於完美的記憶累積 (`MEMORY.md`)，但 CerebraLOS 提供了必要的「遺忘」機制，以防止上下文膨脹。

### 設定

1. 在您的 OpenClaw 配置中，設定記憶輸出路徑以饋送到 CerebraLOS：
   ```json
   {
     "memory_path": ".cerebralos/peripheral/openclaw_logs.md"
   }
   ```
2. CerebraLOS 將根據熵自動衰減這些日誌。
3. 配置 OpenClaw 的系統提示，使其在喚醒時讀取 `.cerebralos/dreams/latest.md`。

## 4. Manus (自主通用 AI)

Manus 可以使用 CerebraLOS 在長期、多日的專案中維持上下文。

### 設定

只需告訴 Manus：
> 「請在此專案中初始化 CerebraLOS，並使用它來管理您的長期記憶。在每個會話結束時執行睡眠任務。」

Manus 將自動處理 `npx cerebralos init` 和 `sleep` 命令，將其發現寫入周邊記憶並從夢境中讀取。

---

## 任何代理的核心工作流程

無論您使用哪種代理，CerebraLOS 的工作流程始終相同：

1. **代理工作** → 將原始日誌/上下文寫入 `.cerebralos/peripheral/`
2. **您睡眠** → 執行 `npx cerebralos sleep` (或透過 cron 自動化)
3. **CerebraLOS 夢境** → 將周邊記憶提煉成 `.cerebralos/dreams/` 並歸檔其餘部分
4. **代理喚醒** → 讀取 `.cerebralos/dreams/latest.md` 以立即掌握專案的「氛圍」和核心架構。

為遺忘而生。為夢想而設計。
