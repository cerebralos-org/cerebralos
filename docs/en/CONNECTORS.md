# CerebraLOS Connector Architecture

CerebraLOS is designed to be the universal "Layer of Subconsciousness" for any AI agent. To achieve this, it must be as easy to connect as building blocks.

This document outlines the standardized connector architecture for integrating CerebraLOS with various types of AI agents.

## The Universal Interface: The Git Repository

The core philosophy of CerebraLOS is **Git-native**. The API is the Git repository itself.
Any AI agent that can read/write files and perform Git operations (or integrate with GitHub) can connect to CerebraLOS.

The interface consists of two primary directories within your cloned CerebraLOS repository:

1. **`peripheral/` (Write-Only for Agents)**: Where agents dump their raw logs, thoughts, and context.
2. **`dreams/` (Read-Only for Agents)**: Where agents read the distilled, long-term architectural insights upon waking up.

---

## Connector Types

We categorize AI agents into three main types, each with a standardized connection method.

### 1. CLI-Based Agents (e.g., Claude Code, Aider)

These agents run in your terminal and have direct access to your local file system.

**Standard Connection Method: System Prompt Injection**

You connect these agents by injecting two simple rules into their configuration file (like `.clauderc` or `.cursorrules`):

*   **Wake Rule:** "Before starting any task, read `[path_to_your_cerebralos_repo]/dreams/latest.md` to understand the current context."
*   **Sleep Rule:** "When finishing a task, append a summary of what you did to `[path_to_your_cerebralos_repo]/peripheral/[agent_name]_log.md`."

**Example (`.clauderc`):**
```markdown
# CerebraLOS Integration
- ALWAYS read `~/my-ai-brain/dreams/latest.md` before starting a new task.
- When you complete a significant milestone, write a brief summary to `~/my-ai-brain/peripheral/claude_code.md`.
```

### 2. Local LLMs & Frameworks (e.g., OpenClaw, LangChain, AutoGen)

These are programmatic agents or frameworks running locally. They usually have built-in memory management systems.

**Standard Connection Method: Memory Path Redirection**

You connect these agents by redirecting their default memory output path to the `peripheral/` directory of your cloned CerebraLOS repository.

**Example (OpenClaw `config.json`):**
```json
{
  "memory": {
    "type": "file",
    "path": "~/my-ai-brain/peripheral/openclaw_memory.md"
  }
}
```
*Note: You must also configure the agent's initialization sequence to read from `~/my-ai-brain/dreams/latest.md`.*

### 3. Web-Based Autonomous Agents (e.g., Manus)

These agents operate in the cloud and cannot directly access your local file system, but they have GitHub integration capabilities.

**Standard Connection Method: GitHub Repository Sharing & Natural Language Instruction**

You connect these agents by giving them access to your CerebraLOS repository (e.g., `my-ai-brain`) and providing natural language instructions.

**Example (Prompt to Manus):**
> "For this project, please use the GitHub repository `my-ai-brain` for your long-term memory.
> 1. Read `my-ai-brain/dreams/latest.md` to get the context.
> 2. Commit and push your progress to `my-ai-brain/peripheral/manus_log.md`."

---

## The "Building Block" Philosophy

By standardizing on the Git repository as the interface, CerebraLOS becomes a universal adapter.

You can have:
*   Local Claude Code writing to `~/my-ai-brain/peripheral/claude.md`
*   Local OpenClaw writing to `~/my-ai-brain/peripheral/openclaw.md`
*   Cloud-based Manus committing to `my-ai-brain/peripheral/manus.md` via GitHub

When the nightly Sleep Job runs (via GitHub Actions or a local cron job), CerebraLOS reads *all* of these peripheral logs, synthesizes them, and **commits a single, unified `dreams/latest.md`**.

The next morning, when all agents wake up (local agents after a `git pull`), they read the same dream and share a **unified understanding** of the project's state. This is how you build a cohesive AI team connected to a single "brain".
