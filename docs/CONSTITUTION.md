# The CerebraLOS Constitution

This document defines the unalterable principles of CerebraLOS. Any feature, pull request, or plugin that violates these principles will be rejected.

## Article I: Memory Sovereignty (A Declaration of Cognitive Independence)
1. **Absolute Ownership**: Your memory is your soul. It must never reside on a server you do not control.
2. **No Vendor Lock-in**: Memories must be stored in plain text (Markdown/JSON) and version-controlled via Git. You can walk away at any time.
3. **LLM Agnosticism**: The system must never depend on a specific AI model. Models will die; your memory must outlive them all.

## Article II: The Right to Forget (Active Forgetting)
1. **Entropy Management**: The system must actively archive old, unused, or noisy memories.
2. **Preservation of "Ma" (間)**: The system must intentionally leave empty space. It must not attempt to show the user everything it knows.
3. **Non-Destructive Deletion**: "Forgetting" means moving to an archive directory (`git mv`), never `rm -rf`. The Git history is the ultimate subconscious.

## Article III: The Principle of "Omotenashi" (Zero UI)
1. **Silent Operation**: The system must do its heavy lifting (Sleep Jobs) asynchronously, without user intervention.
2. **Minimal Interruption**: The system must present insights only at natural transition points (e.g., terminal startup, morning briefings).
3. **Elegance over Exhaustiveness**: When recalling context, the system must present one perfect connection rather than ten mediocre ones.

## Article IV: The Separation of Self and World
1. **Core Memory**: Direct interactions between the user and the AI must be treated as the "Self" and kept pristine.
2. **Peripheral Memory**: Information gathered autonomously by AI agents (Web, Slack, etc.) must be treated as the "World" and kept separate.
3. **Reflux (還流)**: The World may only influence the Self during the Sleep Job, and only as a carefully curated "gift" (Morning Insight).
