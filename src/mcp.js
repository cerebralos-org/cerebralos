// src/mcp.js — Micro-MCP server (personal edition of the WorkIQ CLI)
// The original 2 tools (search_memory / recall_context) keep their behavior.
// 3 knowledge-repo tools:
//   memory_recall — search across the knowledge repo + cerebralos
//   context_pack  — "where am I right now" pack; answers what was happening
//                   in another environment a moment ago
//   memory_locate — look up where external data lives via the links/ index
// The legacy tokoyo_* names are kept as deprecated aliases.
import fs from "fs";
import path from "path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { globSync } from "glob";
import { recallContext } from "./recall.js";
import { CEREBRALOS_DIR, knowledgeRepo } from "./util.js";

const NO_RESULTS = "No relevant memories found.";

// Computed lazily so the configured knowledge_repo is honored.
function repoSearchPaths() {
  const repo = knowledgeRepo();
  return [
    ...["knowledge", "profile", "claude-memory", "links", "portfolio"].map((d) =>
      path.join(repo, d, "**/*.md")
    ),
    path.join(CEREBRALOS_DIR, "dreams/*.md"),
    path.join(CEREBRALOS_DIR, "peripheral/*.md"),
  ];
}

function linksSearchPaths() {
  return [path.join(knowledgeRepo(), "links/*.md")];
}

export async function startMcpServer() {
  const server = new Server(
    { name: "cerebralos-mcp", version: "2.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const querySchema = {
      type: "object",
      properties: {
        query: { type: "string", description: "The concept or entity to search for" },
      },
      required: ["query"],
    };
    const contextSchema = {
      type: "object",
      properties: {
        project: {
          type: "string",
          description: "Optional. Pass a project name to also search for related context",
        },
      },
    };
    const recallDescription =
      "Search the user's personal context (knowledge repo: knowledge/profile/claude-memory/links/portfolio + CerebraLOS: dreams/peripheral). Use when looking for past decisions, learnings, or activity.";
    const contextDescription =
      "Return the user's current-status pack: profile/now.md + portfolio (commitments and deadlines) + the last 3 days of activity logs (across all agents and machines). Call this first at session start, or to find out what was happening in another environment a moment ago.";
    const locateDescription =
      "Look up where data outside the knowledge repo lives (Google Drive, external archives, etc.) via the links/ index. Answers \"where is that file?\".";
    return {
      tools: [
        {
          name: "search_memory",
          description: "Search the Core Memory for specific entities or concepts.",
          inputSchema: querySchema,
        },
        {
          name: "recall_context",
          description: "Recall the full context of a specific entity.",
          inputSchema: querySchema,
        },
        {
          name: "memory_recall",
          description: recallDescription,
          inputSchema: querySchema,
        },
        {
          name: "context_pack",
          description: contextDescription,
          inputSchema: contextSchema,
        },
        {
          name: "memory_locate",
          description: locateDescription,
          inputSchema: querySchema,
        },
        // ---- deprecated aliases (kept for backwards compatibility) ----------
        {
          name: "tokoyo_recall",
          description: `[deprecated: use memory_recall] ${recallDescription}`,
          inputSchema: querySchema,
        },
        {
          name: "tokoyo_context",
          description: `[deprecated: use context_pack] ${contextDescription}`,
          inputSchema: contextSchema,
        },
        {
          name: "tokoyo_locate",
          description: `[deprecated: use memory_locate] ${locateDescription}`,
          inputSchema: querySchema,
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args = request.params.arguments || {};

    if (name === "search_memory" || name === "recall_context") {
      return textResult(await formatRecall(String(args.query || ""), undefined));
    }
    if (name === "memory_recall" || name === "tokoyo_recall") {
      return textResult(await formatRecall(String(args.query || ""), repoSearchPaths()));
    }
    if (name === "memory_locate" || name === "tokoyo_locate") {
      const out = await formatRecall(String(args.query || ""), linksSearchPaths(), 1500);
      return textResult(
        out === NO_RESULTS
          ? "No matching location entry in links/. Check links/INDEX.md in the knowledge repo, or consider adding a new entry."
          : out
      );
    }
    if (name === "context_pack" || name === "tokoyo_context") {
      return textResult(await buildContextPack(args.project ? String(args.project) : undefined));
    }

    throw new Error(`Unknown tool: ${name}`);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function textResult(text) {
  return { content: [{ type: "text", text }] };
}

async function formatRecall(query, paths, snippetLen = 500) {
  if (!query) throw new Error("Query is required");
  const results = await recallContext(query, { topK: 3, silent: true, paths });
  if (results.length === 0) return NO_RESULTS;
  return results
    .map((r) => `--- Memory: ${r.relativePath} ---\n${r.content.substring(0, snippetLen)}...`)
    .join("\n\n");
}

// Context pack: now.md + PORTFOLIO + last 3 days of dreams/peripheral (by mtime)
async function buildContextPack(project) {
  const parts = [];
  const repo = knowledgeRepo();

  const nowPath = path.join(repo, "profile/now.md");
  if (fs.existsSync(nowPath)) {
    parts.push(`=== profile/now.md (current status) ===\n${head(nowPath, 60)}`);
  }

  const portfolioPath = path.join(repo, "portfolio/PORTFOLIO.md");
  if (fs.existsSync(portfolioPath)) {
    parts.push(`=== portfolio/PORTFOLIO.md (commitments & deadlines) ===\n${head(portfolioPath, 60)}`);
  }

  const cutoff = Date.now() - 3 * 86400000;
  const recent = [
    ...globSync(path.join(CEREBRALOS_DIR, "dreams/*.md")),
    ...globSync(path.join(CEREBRALOS_DIR, "peripheral/*.md")),
  ]
    .map((f) => ({ f, mtime: fs.statSync(f).mtimeMs }))
    .filter((x) => x.mtime >= cutoff)
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 10);

  if (recent.length > 0) {
    const activity = recent
      .map((x) => {
        const rel = path.relative(CEREBRALOS_DIR, x.f);
        const when = new Date(x.mtime).toISOString().replace("T", " ").substring(0, 16);
        return `--- ${rel} (${when}) ---\n${head(x.f, 40)}`;
      })
      .join("\n\n");
    parts.push(`=== Activity log, last 3 days (all agents, all machines) ===\n${activity}`);
  } else {
    parts.push("=== Activity log, last 3 days ===\n(no records)");
  }

  if (project) {
    const related = await recallContext(project, { topK: 3, silent: true, paths: repoSearchPaths() });
    if (related.length > 0) {
      parts.push(
        `=== Related to "${project}" ===\n` +
          related.map((r) => `--- ${r.relativePath} ---\n${r.content.substring(0, 400)}...`).join("\n\n")
      );
    }
  }

  return parts.join("\n\n");
}

function head(file, n) {
  try {
    return fs.readFileSync(file, "utf-8").split("\n").slice(0, n).join("\n").trim();
  } catch {
    return "(unreadable)";
  }
}
