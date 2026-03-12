# CerebraLOS Agent Integration Guide

CerebraLOS is designed to be the "Layer of Subconsciousness" for any AI agent. It works seamlessly with your existing tools by acting as a background memory processor.

This guide explains how to connect CerebraLOS to popular AI agents.

## 1. Claude Code (Anthropic)

Claude Code is a powerful CLI-based AI agent. By connecting it to CerebraLOS, Claude Code gains the ability to "forget" irrelevant context and "dream" about architectural insights overnight.

### Setup

1. Initialize CerebraLOS in your project:
   ```bash
   npx cerebralos init
   ```

2. Configure Claude Code to read from CerebraLOS dreams:
   Create or update your `.clauderc` or project instructions to include:
   ```markdown
   Before starting any task, ALWAYS read the latest dream insights from `.cerebralos/dreams/latest.md`.
   When you finish a significant task, write a brief summary to `.cerebralos/peripheral/context.md`.
   ```

3. Run your daily Sleep Job (or set up a cron job):
   ```bash
   npx cerebralos sleep
   ```

## 2. Cursor (AI Code Editor)

Cursor is the most popular AI-first IDE. CerebraLOS can act as its long-term architectural memory.

### Setup

1. Initialize CerebraLOS in your project root.
2. Open Cursor Settings > General > Rules for AI (or `.cursorrules` file).
3. Add the following rule:
   ```markdown
   # CerebraLOS Integration
   - Always check `.cerebralos/dreams/` for architectural context before proposing large refactors.
   - Do not memorize everything. Rely on CerebraLOS to surface relevant context.
   ```
4. When you use `Cmd+K` or `Cmd+L`, Cursor will now naturally incorporate the distilled "dreams" of your project without being overwhelmed by raw logs.

## 3. OpenClaw

OpenClaw is a powerful autonomous agent framework. While OpenClaw focuses on perfect memory accumulation (`MEMORY.md`), CerebraLOS provides the necessary "forgetting" mechanism to prevent context bloat.

### Setup

1. In your OpenClaw configuration, set the memory output path to feed into CerebraLOS:
   ```json
   {
     "memory_path": ".cerebralos/peripheral/openclaw_logs.md"
   }
   ```
2. CerebraLOS will automatically decay these logs based on entropy.
3. Configure OpenClaw's system prompt to read from `.cerebralos/dreams/latest.md` upon waking up.

## 4. Manus (Autonomous General AI)

Manus can use CerebraLOS to maintain context across long-running, multi-day projects.

### Setup

Simply tell Manus:
> "Please initialize CerebraLOS in this project and use it to manage your long-term memory. Run a sleep job at the end of each session."

Manus will automatically handle the `npx cerebralos init` and `sleep` commands, writing its findings to the peripheral memory and reading from dreams.

---

## The Core Workflow for Any Agent

Regardless of which agent you use, the CerebraLOS workflow is always the same:

1. **Agent works** → Writes raw logs/context to `.cerebralos/peripheral/`
2. **You sleep** → Run `npx cerebralos sleep` (or automate via cron)
3. **CerebraLOS dreams** → Distills peripheral memory into `.cerebralos/dreams/` and archives the rest
4. **Agent wakes up** → Reads `.cerebralos/dreams/latest.md` to instantly grasp the "vibe" and core architecture of the project.

Built to forget. Designed to dream.
