# CerebraLOS Onboarding Guide (Building a Git-Native AI Brain)

CerebraLOS is designed to be **Git-native**. This means the most elegant way to manage your AI's subconscious (memory) is through a **private GitHub repository**.

This approach ensures your AI's memory persists across devices and allows you to track the evolution of its thoughts as Git history.

This guide will walk you through creating a "brain" (repository) for your AI and connecting your agents to it.

---

## 1. Create the "Brain" Repository

First, create a dedicated repository on GitHub to store your AI's memory.

### Steps
1. Create a new **Private** repository on GitHub (e.g., `my-ai-brain`).
   *Note: Always make it private, as AI thought logs may contain sensitive information.*
2. Check "Add a README file" during initialization for a smoother setup.

---

## 2. Clone the "Brain" to Your Local PC

Next, sync the created repository to your local environment.

### Steps
Open your terminal and run the following commands:

```bash
# Move to a convenient location, like your home directory
cd ~

# Clone the repository
git clone https://github.com/YOUR_USERNAME/my-ai-brain.git

# Move into the cloned directory
cd my-ai-brain
```

You now have the physical manifestation of your "AI's brain" at `~/my-ai-brain` on your PC.

---

## 3. Create the CerebraLOS Directory Structure

Inside your cloned repository, create the two essential directories used by CerebraLOS.

```bash
# Create directories
mkdir peripheral
mkdir dreams

# Create .gitignore (Crucial!)
cat << EOF > .gitignore
# ❌ Ignore: Daily miscellaneous logs and temporary memories
peripheral/

# ✅ Commit: Distilled "dreams" and "core memories"
!dreams/
!core/

# ❌ Ignore: Temporary files and API keys
tmp/
.env
EOF

# Commit and push the changes
git add .
git commit -m "chore: initialize CerebraLOS directories"
git push origin main
```

### Why do we do this?
- **`peripheral/` (Peripheral Memory)**: Raw logs of what the AI did today. These are destined to be erased when the AI sleeps (Sleep Job), so we do not commit them to Git.
- **`dreams/` (Dreams)**: "Essential insights" distilled from raw logs while sleeping. This is the proof of your AI's growth, so we commit and preserve them in Git.

---

## 4. Connect Your AI Agents

The setup is complete. Now, just connect your AI agents to this "brain".
The connection method falls into two main patterns depending on the type of AI.

### Pattern A: Local-Sync (CLI & Local LLMs)
*Examples: Claude Code, Aider, OpenClaw, Cursor*

These AIs have direct access to your PC's local file system.
Therefore, **have them directly read and write to the `~/my-ai-brain` folder you just cloned.**

**Example Setup (Claude Code):**
Add the following rules to your `.clauderc`.
```markdown
# CerebraLOS Integration
- Before starting a new task, ALWAYS read `~/my-ai-brain/dreams/latest.md` to understand the context.
- When you achieve a significant milestone, write a summary to `~/my-ai-brain/peripheral/claude_code.md`.
```

### Pattern B: GitHub-Connector (Web-based)
*Examples: Manus, GitHub Copilot (Web)*

These AIs run in the cloud and cannot access your local folders.
Instead, **have them directly manipulate the remote `my-ai-brain` repository via GitHub connectors (API or OAuth).**

**Example Setup (Prompt for Manus):**
> "For this project, please use the GitHub repository `my-ai-brain` to manage your long-term memory.
> 1. Read `my-ai-brain/dreams/latest.md` to grasp the context.
> 2. Commit and push your progress to `my-ai-brain/peripheral/manus_log.md`."

---

## 5. Automate "Sleep" with GitHub Actions

This is where CerebraLOS truly shines.
Manually organizing logs every day is tedious. **Let's use GitHub Actions to automatically put your AI to sleep every night.**

### Setup Instructions
Create a file at `~/my-ai-brain/.github/workflows/sleep-job.yml` and paste the following:

```yaml
name: CerebraLOS Nightly Sleep Job

on:
  schedule:
    # Runs daily at 3:00 AM UTC
    - cron: '0 3 * * *'
  workflow_dispatch: # Enables manual trigger button

jobs:
  dream:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Run CerebraLOS Sleep Job
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }} # Key to run the LLM
        run: npx cerebralos sleep

      - name: Commit Dreams
        run: |
          git config --global user.name "CerebraLOS Bot"
          git config --global user.email "bot@cerebralos.local"
          git add dreams/
          # Commit only if there are changes
          git diff --quiet && git diff --staged --quiet || (git commit -m "chore(memory): nightly dream consolidation" && git push)
```

### ⚠️ Final Step: Register Your API Key
To allow GitHub Actions to call the LLM, register your API key in the repository settings.
1. Open your `my-ai-brain` repository on GitHub.
2. Click **Settings** > **Secrets and variables** > **Actions**.
3. Click **New repository secret**.
4. Enter `OPENAI_API_KEY` as the Name.
5. Paste your API key as the Value and save.

---

### What happens now?

While you sleep (or at the specified time), GitHub Actions will automatically trigger.
It will read the day's miscellaneous logs (Peripheral), use the LLM to distill them into "Dreams", and automatically commit them.

The next morning, when you run `cd ~/my-ai-brain && git pull`, you will find **an AI brain that is slightly smarter than yesterday**.
