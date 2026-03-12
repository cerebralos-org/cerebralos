# GitHub 工作流程

本指南說明如何將 CerebraLOS 設定為 GitHub 儲存庫，並連接各種 AI 代理。

## Step 1: Initialize CerebraLOS

```bash
npx cerebralos init
```

## Step 2: First Sleep

```bash
cerebralos sleep
```

## Step 3: Connect Your AI Agents

### Claude Code

```bash
claude mcp add cerebralos npx -- -y cerebralos mcp
```

### Cursor

Settings > Features > MCP > Add New MCP Server
- Name: `cerebralos`
- Command: `npx -y cerebralos mcp`

### Manus / Web Agents

Connect via GitHub repository. Manus reads and writes through the GitHub API.

## Daily Workflow

```
Morning: cerebralos wake    → Read today's insight
Evening: cerebralos sleep   → Consolidate memories
Anytime: cerebralos recall  → Search memories
```
