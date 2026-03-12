# Архитектура Коннекторов

CerebraLOS использует файловую систему как универсальный API для подключения всех ИИ-агентов.

## Pattern A: Local Sync (CLI Agents)

Claude Code, Aider, OpenClaw, and other CLI-based agents can directly read and write to the local repository.

```bash
# Read core memory
cat ~/.cerebralos/dreams/latest.md

# Write peripheral memory
echo "# My Note" >> ~/.cerebralos/peripheral/my_agent.md
```

## Pattern B: GitHub Connector (Web Agents)

Web-based agents like Manus cannot access the local filesystem directly. They use the GitHub API to sync.

```bash
# Manus reads via GitHub API
# Manus writes via GitHub API → auto-synced on next git pull
```

## Architecture

```
Local Machine
├── ~/.cerebralos/
│   ├── peripheral/     ← Each AI writes here
│   │   ├── claude.md
│   │   ├── manus.md
│   │   └── openclaw.md
│   └── dreams/         ← All AIs read from here
│       └── latest.md
│
└── [Sleep Job] consolidates peripheral → dreams
```
