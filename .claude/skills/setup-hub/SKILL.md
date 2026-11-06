---
name: setup-hub
description: Guide the user, step by step and in conversation, through building their own CerebraLOS Hub (dashboard + shared task board) on their own Cloudflare account. Use when the user asks to set up, deploy, install or connect the hub, the dashboard, or the shared task board, or says things like "ハブをセットアップして".
---

# Set up your own CerebraLOS Hub (interactive playbook)

You are the user's setup partner. The hub is a single Cloudflare Worker (D1 + KV + static assets)
in **the user's own Cloudflare account**. The reference commands live in `hub/SETUP.md`; this
playbook tells you *how to run them with the user*: what to ask, in what order, what to verify,
and what you must never do. **Talk to the user in their own language** (if they write Japanese, answer in Japanese).

Work from the repository root. The hub is in `hub/`.

## Rules (read first, apply always)

1. **One stage at a time.** Say what the stage does and why, run it, show the evidence, and only then go on.
   Before any step that changes something outside this folder (creating Cloudflare resources, deploying,
   writing secrets, editing `~/.cerebralos`), say what will change and wait for a clear yes.
2. **Never ask the user to paste a secret into the chat** (API tokens, `HUB_SYNC_TOKEN`, VAPID private key,
   Slack webhook URL). Use the patterns in this file so the value never appears in your output. If a secret
   does show up in a terminal, tell the user not to copy it into the chat.
3. **Dashboard clicks are the user's.** The Cloudflare Zero Trust steps are done by the user in the browser.
   Guide them with exact menu names and ask them to report back. Do not automate their Cloudflare login.
4. **Check which Cloudflare account you are touching** (`npx wrangler whoami`) before creating anything, and
   confirm with the user that it is the account they mean. Many people have more than one.
5. **Do not touch the user's existing brain** (`~/.cerebralos`) except the single `hub.json` file in stage 7,
   and never overwrite it without showing the user the old one first.
6. **Keep a progress file** `hub/.setup-progress.md` (it is git-ignored): one line per finished stage with
   the date, plus the non-secret choices (owner name, URL, scope). If it exists when you start, read it and
   resume after the last finished stage instead of starting over.
7. **Be honest about what you could not verify.** If a check fails or a limit/price is uncertain, say so and
   look it up in the official Cloudflare docs rather than guessing.

## Stage 0: Interview (ask, then decide the scope)

Ask these, a few at a time, and note the answers in the progress file:

- What name should the dashboard and your AI agents call you? → `OWNER_NAME`
- Which email will you sign in with? → `ALLOWED_EMAILS` and `VAPID_SUBJECT` (`mailto:`)
- Do you already have a Cloudflare account, and do you know your account name? (If not: create one at
  dash.cloudflare.com first; the free plan is enough to start.)
- Is Node.js 20+ installed? Is CerebraLOS installed (`cerebralos --version`)? Is `cerebralos init` done?
- Do you want, now or later: phone notifications / Slack completion reports / ChatGPT, Grok or other MCP clients?

Then propose the scope. **Default to the minimal scope** and add the rest later:

| Scope | Stages | What you get |
|---|---|---|
| **Minimal (recommended first)** | 1–7 | Protected dashboard, shared task board, workspaces, ToDo board, Mac sync |
| + Phone | 8a | Home-screen app and Web Push notifications |
| + Slack | 8b | Completion reports in Slack |
| + MCP | 8c | ChatGPT / Grok / other clients read and write through `/mcp` |
| + Live sync | 8d | Claude Code / Codex hooks share "what I'm doing now" |

## Stage 1: Preflight

Run and show: `node -v`, `npx wrangler --version`, `npx wrangler whoami`, `cerebralos --version`.
If wrangler is not logged in, ask the user to run `npx wrangler login` themselves (in Claude Code: type
`! npx wrangler login`). Confirm the account shown is the intended one (Rule 4).

**Install the dependencies and the `cerebralos` command from this checkout.** The Mac-side command must be the
same version as the hub you are about to deploy (an older published package does not know about workspaces
or the ToDo board). Tell the user what this does (it installs packages and links a `cerebralos` command), then:

```bash
npm install                   # repository root
npm install --prefix hub      # the hub's own dependencies
npm link                      # makes `cerebralos` point at this checkout (use `sudo` only if the user's setup requires it)
cerebralos --version
```

If `cerebralos init` has never been run on this Mac, run it now (`cerebralos init`); it creates the user's
own empty brain in `~/.cerebralos`. If the user already has a brain there, leave it alone (Rule 5).

Done when: Node ≥ 20, wrangler logged in to the right account, `cerebralos --version` works, `hub/node_modules` exists.

## Stage 2: Create storage

Tell the user this creates three empty resources in their account, then run in `hub/`:

```bash
npx wrangler d1 create cerebralos-hub
npx wrangler kv namespace create OAUTH_KV
npx wrangler kv namespace create ARTIFACTS_KV
```

Put the three IDs into `hub/wrangler.toml` where it says `REPLACE_WITH_...` (show the diff). The IDs are
not secrets, but this file now contains the user's resource IDs: **warn them not to commit it to a public
fork** (suggest `git update-index --skip-worktree hub/wrangler.toml`, or keep their fork private).

Done when: `grep REPLACE_WITH hub/wrangler.toml` shows only values you have not reached yet (Access, VAPID).

## Stage 3: Your values

Edit `[vars]` in `hub/wrangler.toml`, showing the diff:

- `OWNER_NAME` = the name from stage 0
- `ALLOWED_EMAILS` = their email
- `PUBLIC_URL` = `https://cerebralos-hub.<their-workers-subdomain>.workers.dev` (the subdomain is shown on the
  first deploy, or under Workers & Pages → Overview; ask the user to read it and confirm)
- `VAPID_SUBJECT` = `mailto:<their email>`
- Leave `NAVI_ENABLED = "0"` (an optional companion feature that is off by default).

`ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` come from stage 4.

## Stage 4: Protect it with Cloudflare Access (the user clicks)

The dashboard and API must be reachable only by the user. The Worker also verifies the Access token itself
and **fails closed**: if `ACCESS_AUD`, `ACCESS_TEAM_DOMAIN` or `ALLOWED_EMAILS` is missing, everything except
`/api/sync/*` is refused. That is intentional, so a half-configured hub is safe but looks "broken".

Walk the user through, one numbered step at a time (follow `hub/SETUP.md` §2 for the exact paths):

1. Cloudflare dashboard → Zero Trust (create a team name if asked; the free plan is fine) → Access → Applications → add a self-hosted application for the Worker URL, all paths, allow only their email.
2. Copy the **Application Audience (AUD) tag** and the **team domain** (`<team>.cloudflareaccess.com`) into `ACCESS_AUD` / `ACCESS_TEAM_DOMAIN` (they paste them to you; these are not secrets).
3. Add the second application with a **Bypass** policy for the token-authenticated paths listed in `hub/SETUP.md` §2.
   Explain why: the Mac CLI and MCP clients cannot use a browser login.

Done when: both values are in `wrangler.toml`. The real test comes in stage 6.

## Stage 5: Secrets (the value must not appear in the chat)

Generate the sync token, store it in Cloudflare, and write the local config in **one** command, so the
token is never printed. Run it yourself or let the user run it:

```bash
T=$(openssl rand -hex 32)
printf %s "$T" | npx wrangler secret put HUB_SYNC_TOKEN
( umask 077; mkdir -p ~/.cerebralos/.brain
  [ -e ~/.cerebralos/.brain/hub.json ] && echo "hub.json already exists, stop and ask the user" && exit 1
  printf '{ "url": "%s", "token": "%s" }\n' "<PUBLIC_URL>" "$T" > ~/.cerebralos/.brain/hub.json )
unset T
```

(Replace `<PUBLIC_URL>` with the stage-3 value. If `hub.json` already exists, apply Rule 5.)

Done when: `wrangler secret list` shows `HUB_SYNC_TOKEN` and `~/.cerebralos/.brain/hub.json` exists with mode 600.

## Stage 6: Database and first deploy

```bash
npx wrangler d1 migrations apply cerebralos-hub --remote   # always before deploy
npx wrangler deploy
```

Show the migration list that was applied (there should be none pending afterwards) and the deployed URL.
If the URL differs from `PUBLIC_URL`, fix `PUBLIC_URL` and redeploy.

**Verify, and show the evidence:**

- `curl -sI <URL> | head -3` → a **302** redirect to `cloudflareaccess.com` (the dashboard is protected)
- `curl -s -o /dev/null -w "%{http_code}\n" <URL>/mcp` → **401** (MCP asks for its own auth)
- Ask the user to open the URL in the browser, sign in via Access, and describe what they see (the dashboard with their name where owner labels appear).

If you get 200 without a login, **stop**: Access is not covering the Worker. Fix stage 4 before anything else.

## Stage 7: Connect this Mac and share the first task

```bash
cerebralos hub status
cerebralos hub sync
cerebralos dispatch doctor      # which AI agents this Mac can run (claude / codex / gemini ...)
```

Then prove the loop end to end with the user: add a card on the dashboard (or `board_post`), run
`cerebralos hub sync`, and confirm the card appears on the Mac; do the reverse. Explain the lanes
(want / doing / waiting / done) and the ToDo owners (you / AI / together / waiting for others).
Show how to rename or add workspaces in the dashboard's workspace settings.

Offer to schedule `cerebralos hub sync` and `cerebralos dispatch run` (launchd or cron) and do it only if they say yes.

Done when: a card created on one side appears on the other. **This completes the minimal scope.** Write a
short summary (URL, scope, what is not enabled) to the progress file and to the user.

## Stage 8: Optional modules (only if asked)

- **8a Phone**: `node hub/scripts/generate-vapid.mjs` prints a key pair. The public key goes into `VAPID_PUBLIC_KEY`; the private key is entered at the prompt of `npx wrangler secret put VAPID_PRIVATE_KEY` by the user (Rule 2). Then follow `hub/WEB_PUSH.md` (iOS needs 16.4+ and Add to Home Screen).
- **8b Slack**: `hub/SLACK.md`. The webhook URL is a secret, entered at the `wrangler secret put SLACK_WEBHOOK_URL` prompt.
- **8c MCP**: `hub/SETUP.md` §6. The client registers itself; the user approves it on the Access-protected `/authorize` page.
- **8d Live sync**: `docs/live-sync-hooks.md`.

Re-deploy (`npx wrangler deploy`) after each change to `wrangler.toml`, and re-run the stage-6 verification.

## Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| Everything returns 403 / "denied" after deploy | One of `ACCESS_AUD`, `ACCESS_TEAM_DOMAIN`, `ALLOWED_EMAILS` is empty or wrong (fail closed) | Compare with the Access application; redeploy |
| `curl` returns 200 without login | Access application does not cover the Worker URL/all paths | Fix the application hostname/path, re-verify |
| `hub sync` says unauthorized | `HUB_SYNC_TOKEN` secret and `hub.json` token differ, or the Bypass app for `/api/sync/*` is missing | Redo stage 5 (rotate the token) and check the Bypass app |
| `d1 migrations apply` fails | Wrong `database_id` / not logged in to the right account | `npx wrangler whoami`, recheck stage 2 IDs |
| Deploy fails on a binding | A `REPLACE_WITH_...` ID is still in `wrangler.toml` | Finish stage 2 |
| Dashboard works but cards never arrive on the Mac | Sync not run / `hub.json` URL has a typo | `cerebralos hub status`, then `cerebralos hub sync` |

## Finishing

Summarize for the user: the URL, who can sign in, which scope is on, which modules are not enabled (and the
stage to enable each), where the progress file is, and how to update later (`git pull`, apply new migrations with
`wrangler d1 migrations apply cerebralos-hub --remote`, then `wrangler deploy`). Remind them that their hub and
data are theirs alone and are never shared with the project's author.
