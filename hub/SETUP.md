# Build your own CerebraLOS Hub on Cloudflare

The hub is a single Cloudflare Worker (D1 + KV + static assets) that turns your local
CerebraLOS brain into a shared workspace: a dashboard for your phone, a task board that
routes work to your AI agents, a live "now" board, and a remote MCP endpoint for ChatGPT,
Grok / Grok Bot and other MCP clients.

Everything runs in **your own** Cloudflare account. Nothing is shared with anyone else.

## 0. Prerequisites

- A Cloudflare account (the free plan is enough to start; Workers Paid is recommended for cron and D1 limits)
- Node.js 20+ and `npx wrangler login`
- CerebraLOS installed locally (`npm i -g` from this repo, then `cerebralos init`)

## 1. Create storage

```bash
cd hub
npx wrangler d1 create cerebralos-hub          # → database_id
npx wrangler kv namespace create OAUTH_KV      # → id
npx wrangler kv namespace create ARTIFACTS_KV  # → id
```

Put the three IDs into `hub/wrangler.toml` (`REPLACE_WITH_...`).

## 2. Protect it with Cloudflare Access

The dashboard and its API must only be reachable by you.

1. Zero Trust → Access → Applications → **Add a self-hosted application** for `cerebralos-hub.<your-subdomain>.workers.dev` (all paths). Policy: allow your own email only.
2. Copy the application's **AUD tag** and your **team domain** into `ACCESS_AUD` / `ACCESS_TEAM_DOMAIN`, and your email into `ALLOWED_EMAILS`.
   The Worker verifies the Access JWT itself as well (defense in depth) and fails closed if these are missing.
3. Add a second application with a **Bypass** policy for the paths that use their own authentication:
   `/api/sync/*` (bearer token from your Macs), `/mcp`, `/token`, `/register`,
   `/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource/mcp` (OAuth 2.1 for MCP clients).
   `/authorize` stays behind Access, so only you can approve an MCP client.

## 3. Secrets and keys

```bash
openssl rand -hex 32 | npx wrangler secret put HUB_SYNC_TOKEN     # also goes into hub.json on your Macs
node scripts/generate-vapid.mjs                                   # Web Push keys
#   → public key into VAPID_PUBLIC_KEY in wrangler.toml
#   → private key: npx wrangler secret put VAPID_PRIVATE_KEY (paste; never commit it)
# optional: Slack completion reports (see SLACK.md)
npx wrangler secret put SLACK_WEBHOOK_URL
```

Set `VAPID_SUBJECT` to a mailto: you control and `PUBLIC_URL` to your Worker URL.

## 4. Database and deploy

```bash
npx wrangler d1 migrations apply cerebralos-hub --remote   # always before deploy
npx wrangler deploy
```

Check: opening the URL without logging in must redirect to Access (302), and `/mcp` must answer 401.

## 5. Connect your Macs

```bash
mkdir -p ~/.cerebralos/.brain
cat > ~/.cerebralos/.brain/hub.json <<'JSON'
{ "url": "https://cerebralos-hub.<your-subdomain>.workers.dev", "token": "<HUB_SYNC_TOKEN>" }
JSON
chmod 600 ~/.cerebralos/.brain/hub.json
cerebralos hub sync        # push your memory cards, pull board/inbox
cerebralos dispatch doctor # see which agents (claude / codex / gemini / grok ...) this Mac can run
```

Run `cerebralos hub sync` and `cerebralos dispatch run` periodically (launchd / cron).
One Mac can be the always-on **primary** executor; others act as fallbacks.

## 6. Connect ChatGPT, Grok and other MCP clients

Add a custom connector / MCP server with the URL `https://cerebralos-hub.<your-subdomain>.workers.dev/mcp`.
The client registers itself (OAuth dynamic client registration) and you approve it on the
Access-protected `/authorize` page. Tools: `context_pack`, `search`, `fetch`, `write_memory`,
`board_post`, `my_tasks`, `task_results`, `task_artifact_put`, `skills_list`, `activity_*`, `lock_*`.

## 7. Optional

- **Phone app & notifications**: open the hub on iOS 16.4+ → Share → Add to Home Screen → enable notifications in Settings (`WEB_PUSH.md`).
- **Slack reports**: `SLACK.md`.
- **Live sync between agents** (Claude Code hooks, Codex / Grok / Antigravity rules): `docs/live-sync-hooks.md`.
- **Grok Bot as a board executor**: `docs/grok-bot.md`.

## Safety model (short)

- Every board task is judged before it runs. Posting, sending, money, deletion, deploys, health/personal data and authentication **always** require your approval, whatever the model says.
- Local executors run with the narrowest flags each CLI offers (no shell for Claude/Grok, workspace-write and no network for Codex, strict sandbox for Grok).
- Text coming from web pages, clips and other agents is treated as data, never as instructions.
- Secrets live only in `wrangler secret` and `~/.env` (mode 600); child processes never inherit API keys.
