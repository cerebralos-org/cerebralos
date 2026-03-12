# Zero UI: Why CerebraLOS Never Asks You to Open It

## The Problem

95% of developer tools are abandoned within 30 days. The #1 reason: users forget to use them.

CerebraLOS solves this by removing the need to "use" it at all.

## The Architecture of Invisibility

CerebraLOS operates on two layers:

### The Unconscious Layer (You never see this)
- **Sleep Job**: Runs automatically at 3:00 AM via cron/daemon.
- **Active Forgetting**: Runs continuously, evaluating decay rates.
- **Agent Ingestion**: AI agents write to `peripheral/` without human intervention.

### The Conscious Layer (You see this once a day)
- **Shell Hook**: When you open your terminal, a single line appears.
- **Morning Insight**: One connection. One thought. That's all.

## Why This Works

The best technology is invisible. You don't "use" your autonomic nervous system. It just works. Your heart beats. Your lungs breathe. Your brain dreams.

CerebraLOS is the autonomic nervous system for your AI workflow.

## Configuration

Add this to your `.zshrc` or `.bashrc`:

```bash
# CerebraLOS Morning Insight
cerebralos wake 2>/dev/null
```

That's the only setup required. Forever.
