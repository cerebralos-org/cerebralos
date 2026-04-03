import fs from 'fs';
import path from 'path';
import os from 'os';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { recallContext } from "./recall.js";
import { writeMemory } from "./write.js";

export async function startMcpServer(CEREBRALOS_DIR = path.join(os.homedir(), '.cerebralos')) {
  const server = new Server(
    {
      name: "cerebralos-mcp",
      version: "2.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "search_memory",
          description: "Search CerebraLOS memory for specific entities or concepts.",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "The concept or entity to search for",
              },
            },
            required: ["query"],
          },
        },
        {
          name: "recall_context",
          description: "Recall the full context of a specific entity from CerebraLOS.",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "The concept or entity to recall context for",
              },
            },
            required: ["query"],
          },
        },
        {
          name: "write_memory",
          description: "Write a new memory to CerebraLOS peripheral storage. Use this to save insights, decisions, or observations during your work session.",
          inputSchema: {
            type: "object",
            properties: {
              content: {
                type: "string",
                description: "The memory content to write (markdown)",
              },
              topic: {
                type: "string",
                description: "A short title for this memory",
              },
              source: {
                type: "string",
                description: "Identifier of the agent writing (e.g., 'claude-code', 'cursor', 'codex')",
              },
              tags: {
                type: "array",
                items: { type: "string" },
                description: "Optional tags for categorization",
              },
            },
            required: ["content", "topic", "source"],
          },
        },
        {
          name: "list_dreams",
          description: "Read the latest Morning Insight(s) from CerebraLOS dreams.",
          inputSchema: {
            type: "object",
            properties: {
              count: {
                type: "number",
                description: "Number of recent dreams to return (default: 1, max: 5)",
              },
            },
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === "search_memory" || name === "recall_context") {
      const query = String(args?.query);
      if (!query) throw new Error("Query is required");

      const results = await recallContext(query, { topK: 3, silent: true }, CEREBRALOS_DIR);

      if (results.length === 0) {
        return { content: [{ type: "text", text: "No relevant memories found." }] };
      }

      const formatted = results.map(r =>
        `--- Memory: ${r.relativePath} ---\n${r.content.substring(0, 500)}...`
      ).join('\n\n');

      return { content: [{ type: "text", text: formatted }] };
    }

    if (name === "write_memory") {
      const { content, topic, source, tags } = args;
      if (!content || !topic || !source) throw new Error("content, topic, and source are required");

      const result = await writeMemory({
        body: content,
        topic,
        from: source,
        tags: tags || [],
        brainDir: CEREBRALOS_DIR
      });

      return { content: [{ type: "text", text: `Memory saved: ${result.relativePath}` }] };
    }

    if (name === "list_dreams") {
      const count = Math.min(Math.max(args?.count || 1, 1), 5);
      const dreamsDir = path.join(CEREBRALOS_DIR, 'dreams');

      if (!fs.existsSync(dreamsDir)) {
        return { content: [{ type: "text", text: "No dreams found yet." }] };
      }

      const files = fs.readdirSync(dreamsDir)
        .filter(f => f.endsWith('.md'))
        .sort()
        .reverse()
        .slice(0, count);

      if (files.length === 0) {
        return { content: [{ type: "text", text: "No dreams found yet." }] };
      }

      const dreams = files.map(f => {
        const content = fs.readFileSync(path.join(dreamsDir, f), 'utf-8');
        return `--- ${f} ---\n${content}`;
      }).join('\n\n');

      return { content: [{ type: "text", text: dreams }] };
    }

    throw new Error(`Unknown tool: ${name}`);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
