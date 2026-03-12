# سير عمل GitHub

يشرح هذا الدليل كيفية إعداد CerebraLOS كمستودع GitHub وتوصيل وكلاء الذكاء الاصطناعي المختلفين.

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
