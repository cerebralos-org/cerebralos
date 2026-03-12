import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { recallContext } from "./recall.js";

export async function startMcpServer() {
  const server = new Server(
    {
      name: "cerebralos-mcp",
      version: "1.0.0",
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
          description: "Search the Core Memory for specific entities or concepts.",
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
          description: "Recall the full context of a specific entity.",
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
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "search_memory" || request.params.name === "recall_context") {
      const query = String(request.params.arguments?.query);
      if (!query) {
        throw new Error("Query is required");
      }

      // Use the actual recall logic, but silently
      const results = await recallContext(query, { topK: 3, silent: true });
      
      if (results.length === 0) {
        return {
          content: [{ type: "text", text: "No relevant memories found." }],
        };
      }

      const formattedResults = results.map(r => 
        `--- Memory: ${r.relativePath} ---\n${r.content.substring(0, 500)}...`
      ).join('\n\n');

      return {
        content: [{ type: "text", text: formattedResults }],
      };
    }

    throw new Error(`Unknown tool: ${request.params.name}`);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
