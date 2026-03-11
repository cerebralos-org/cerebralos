# Contributing to CerebraLOS

First off, thank you for considering contributing to CerebraLOS! It's people like you that make CerebraLOS such a great tool.

## The "Cognitive OS" Philosophy

Before contributing code, please understand our core philosophy:
1. **No Databases**: We rely entirely on the filesystem (Markdown) and JSON ledgers. Do not introduce database dependencies (e.g., SQLite, Redis, Pinecone).
2. **Active Forgetting**: Features that help the system *forget* or *archive* noise are just as important as features that help it remember.
3. **Simplicity at the Core**: The core engine must remain lightweight. Complex logic should be implemented as Plugins.

## How to Contribute

### 1. Reporting Bugs
- Use the GitHub Issue Tracker.
- Describe the bug clearly, including steps to reproduce, expected behavior, and actual behavior.
- Include your OS, Node.js version, and CerebraLOS version.

### 2. Suggesting Enhancements
- Open an Issue with the tag `enhancement`.
- Explain *why* this enhancement is necessary and how it aligns with the "Cognitive OS" philosophy.

### 3. Pull Requests
1. Fork the repo and create your branch from `main`.
2. If you've added code that should be tested, add tests.
3. Ensure the test suite passes.
4. Make sure your code lints.
5. Issue that pull request!

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR-USERNAME/cerebralos.git
cd cerebralos

# Install dependencies
npm install

# Run tests
npm test
```

## Plugin Development

If you are building a plugin (e.g., a new Sleep Job algorithm), please refer to the `docs/PLUGIN_DEVELOPMENT.md` guide (coming soon). Plugins should be published as separate npm packages with the prefix `cerebralos-plugin-`.

## Code of Conduct

Please note that this project is released with a Contributor Code of Conduct. By participating in this project you agree to abide by its terms.
