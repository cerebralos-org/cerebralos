# GitHub 워크플로우

이 가이드는 CerebraLOS를 GitHub 저장소로 설정하고 다양한 AI 에이전트를 연결하는 방법을 설명합니다.

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
