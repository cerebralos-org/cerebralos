# CerebraLOS Architecture

CerebraLOS is designed as a **Git-native, LLM-agnostic file system** that acts as the cognitive layer for AI agents.

## 1. The Directory Structure (The Brain)

The entire system lives in `~/.cerebralos/`.

```text
~/.cerebralos/
├── core/               # The "Self". Direct user-AI interactions.
│   ├── daily/          # Daily logs and thoughts
│   └── entities/       # Known concepts, people, and projects
├── peripheral/         # The "World". Autonomous agent memories.
│   ├── web_cache/      # Information scraped by agents
│   └── tool_logs/      # Logs from Slack, GitHub, etc.
├── dreams/             # Insights generated during Sleep Jobs
│   └── YYYY-MM-DD.md   # The Morning Insight
├── archive/            # Actively forgotten memories
└── .brain/             # System configuration and state
    ├── config.json     # User preferences
    └── schema.yaml     # Data structure definitions
```

## 2. The Three Core Processes

### A. Contextual Recall (The Hippocampus)
When an AI agent needs context, it doesn't search everything. It uses **Pattern Completion**.
- **Input**: A partial cue (e.g., "the project we discussed last week about the new OS").
- **Process**: The `recall.js` script uses vector embeddings and semantic search to find the most relevant nodes in `core/`.
- **Output**: A highly compressed, relevant context string.

### B. Active Forgetting (The Amygdala)
To prevent the system from becoming a bloated PKM, CerebraLOS actively forgets.
- **Process**: A cron job evaluates the "decay rate" of files in `core/` and `peripheral/`.
- **Action**: Files that haven't been accessed or recalled recently are moved to `archive/` via `git mv`.
- **Result**: The active context window remains small, fast, and highly relevant.

### C. Sleep Job (Dream Consolidation)
This is the magic of CerebraLOS.
- **Trigger**: Runs automatically at 3:00 AM (or when the system is idle).
- **Process**: The `sleep.js` script reads recent entries in `core/` and cross-references them with new data in `peripheral/`.
- **Action**: It synthesizes a single, profound connection between the "Self" and the "World".
- **Output**: A new file in `dreams/` and a notification ready for the user's morning.

## 3. Integration Interfaces

### CLI (Zero UI)
The primary interface for the human user.
- `cerebralos init`: Sets up the directory.
- `cerebralos wake`: Displays the Morning Insight.
- `cerebralos explore`: Allows manual browsing of the brain.

### Micro-MCP (For AI Agents)
The interface for Claude, Cursor, Devin, Manus, etc.
- Exposes only two tools to minimize token usage:
  1. `search_memory(query)`
  2. `recall_context(entity_id)`
- Agents cannot write directly to `core/`. They write to `peripheral/`, and the Sleep Job decides what gets promoted.

*Why only two tools?*
Traditional MCP servers expose dozens of tools, consuming up to 90,000 tokens per request just for tool descriptions. CerebraLOS uses a "Micro-MCP" approach, consuming less than 500 tokens. This is not a limitation—it is a design principle. It forces the AI to ask specific questions rather than dumping the entire database into the context window. Less noise, more signal.
