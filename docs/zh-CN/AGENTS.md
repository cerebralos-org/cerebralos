# CerebraLOS 代理集成指南

CerebraLOS 旨在成为任何 AI 代理的“潜意识层”。它通过充当后台记忆处理器，与您现有的工具无缝协作。

本指南解释了如何将 CerebraLOS 连接到流行的 AI 代理。

## 1. Claude Code (Anthropic)

Claude Code 是一个强大的基于 CLI 的 AI 代理。通过将其连接到 CerebraLOS，Claude Code 获得了“遗忘”不相关上下文和“梦想”架构洞察的能力。

### 设置

1. 在您的项目中初始化 CerebraLOS：
   ```bash
   npx cerebralos init
   ```

2. 配置 Claude Code 以读取 CerebraLOS 的梦想：
   创建或更新您的 `.clauderc` 或项目说明以包含：
   ```markdown
   Before starting any task, ALWAYS read the latest dream insights from `.cerebralos/dreams/latest.md`
   When you finish a significant task, write a brief summary to `.cerebralos/peripheral/context.md`
   ```

3. 运行您的每日睡眠作业（或设置 cron 作业）：
   ```bash
   npx cerebralos sleep
   ```

## 2. Cursor (AI 代码编辑器)

Cursor 是最受欢迎的 AI 优先 IDE。CerebraLOS 可以充当其长期的架构记忆。

### 设置

1. 在您的项目根目录中初始化 CerebraLOS。
2. 打开 Cursor 设置 > General > Rules for AI（或 `.cursorrules` 文件）。
3. 添加以下规则：
   ```markdown
   # CerebraLOS Integration
   - Always check `.cerebralos/dreams/` for architectural context before proposing large refactors.
   - Do not memorize everything. Rely on CerebraLOS to surface relevant context.
   ```
4. 当您使用 `Cmd+K` 或 `Cmd+L` 时，Cursor 现在将自然地整合您项目提炼出的“梦想”，而不会被原始日志淹没。

## 3. OpenClaw

OpenClaw 是一个强大的自主代理框架。虽然 OpenClaw 专注于完美的记忆积累 (`MEMORY.md`)，但 CerebraLOS 提供了必要的“遗忘”机制，以防止上下文膨胀。

### 设置

1. 在您的 OpenClaw 配置中，将记忆输出路径设置为馈送到 CerebraLOS：
   ```json
   {
     "memory_path": ".cerebralos/peripheral/openclaw_logs.md"
   }
   ```
2. CerebraLOS 将根据熵自动衰减这些日志。
3. 配置 OpenClaw 的系统提示，使其在唤醒时从 `.cerebralos/dreams/latest.md` 读取。

## 4. Manus (自主通用 AI)

Manus 可以使用 CerebraLOS 在长期、多日的项目中保持上下文。

### 设置

只需告诉 Manus：
> "Please initialize CerebraLOS in this project and use it to manage your long-term memory. Run a sleep job at the end of each session."

Manus 将自动处理 `npx cerebralos init` 和 `sleep` 命令，将其发现写入外围记忆并从梦想中读取。

---

## 任何代理的核心工作流程

无论您使用哪种代理，CerebraLOS 的工作流程始终相同：

1. **代理工作** → 将原始日志/上下文写入 `.cerebralos/peripheral/`
2. **您睡眠** → 运行 `npx cerebralos sleep`（或通过 cron 自动化）
3. **CerebraLOS 梦想** → 将外围记忆提炼成 `.cerebralos/dreams/` 并归档其余部分
4. **代理醒来** → 读取 `.cerebralos/dreams/latest.md` 以立即掌握项目的“氛围”和核心架构。

旨在遗忘。为梦想而生。