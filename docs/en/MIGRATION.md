# Memory Migration Guide: From Your AI to CerebraLOS

This guide explains how to migrate the memories your AI (ChatGPT, Claude, Gemini, etc.) has accumulated about you into CerebraLOS.

## Step 1: Export Your Memory from Your Current AI

Copy the following prompt and send it to your current AI:

```text
Export all of my stored memories and any context you've learned about me from past conversations. Preserve my words verbatim where possible, especially for instructions and preferences.

## Categories (output in this order):
1. **Instructions**: Rules I've explicitly asked you to follow going forward — tone, format, style, "always do X", "never do Y", and corrections to your behavior.
2. **Identity**: Name, age, location, education, family, relationships, languages, and personal interests.
3. **Career**: Current and past roles, companies, and general skill areas.
4. **Projects**: Projects I meaningfully built or committed to. Ideally ONE entry per project. Include what it does, current status, and any key decisions.
5. **Preferences**: Opinions, tastes, and working-style preferences that apply broadly.

## Format:
Use section headers for each category. Within each category, list one entry per line, sorted by oldest date first. Format each line as:
[YYYY-MM-DD] - Entry content here.

If no date is known, use [unknown] instead.

## Output:
- Wrap the entire export in a single code block for easy copying.
- After the code block, state whether this is the complete set or if more remain.
```

## Step 2: Import into CerebraLOS

Copy the Markdown content from the AI's output and run the following commands in your terminal:

```bash
# Save clipboard content to a file (macOS)
pbpaste > ~/my_memory.md

# On Linux/Windows, paste manually into a file, then:
cerebralos import --from ~/my_memory.md --type ai_export
```

### Importing from Obsidian Vault

```bash
cerebralos import --from ~/path/to/ObsidianVault
```

### Importing from ChatGPT JSON export

```bash
cerebralos import --from ~/Downloads/conversations.json --type chatgpt
```

## Step 3: Dream (Memory Consolidation)

Imported memories are stored as "Peripheral Memory". Run a sleep job to consolidate them into CerebraLOS's core:

```bash
cerebralos sleep
```

That's it! Your past memories are now integrated into CerebraLOS's subconscious layer. From now on, every AI agent you connect will share this memory.

---

## Supported Import Sources

| Source | Command |
|---|---|
| AI memory export (ChatGPT, Claude, Gemini) | `cerebralos import --from file.md --type ai_export` |
| Obsidian Vault (folder) | `cerebralos import --from ~/ObsidianVault` |
| ChatGPT conversation history JSON | `cerebralos import --from conversations.json --type chatgpt` |
| Any Markdown file | `cerebralos import --from notes.md` |
