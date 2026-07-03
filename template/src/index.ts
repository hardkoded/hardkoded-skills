#!/usr/bin/env node

/**
 * hardkoded-skills MCP Server Template
 *
 * This file is the entry point for your skill. It creates an MCP server that
 * exposes tools, resources, and prompts to AI assistants such as:
 *   - Claude (via Claude Desktop)
 *   - GitHub Copilot (via VS Code MCP support)
 *   - Cursor
 *   - OpenAI Codex / ChatGPT (via plugin manifest)
 *
 * Getting started:
 *   1. Rename "my-hardkoded-skill" in package.json to your skill name.
 *   2. Add your tools, resources, and prompts below.
 *   3. Run `npm run build` and wire it up using one of the configs in ../configs/.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "my-hardkoded-skill",
  version: "0.1.0",
});

// ---------------------------------------------------------------------------
// Tools  – actions the AI can invoke on your behalf
// ---------------------------------------------------------------------------

/**
 * Example tool: echo
 * Receives a message and returns it back.
 * Replace this with your own logic.
 */
server.registerTool(
  "echo",
  {
    title: "Echo",
    description:
      "Echoes the provided message back. Use this to verify the skill is working.",
    inputSchema: {
      message: z.string().describe("The message to echo back"),
    },
  },
  async ({ message }) => ({
    content: [{ type: "text", text: `Echo: ${message}` }],
  })
);

/**
 * Example tool: add
 * Adds two numbers together.
 * Replace or remove this once you add your own tools.
 */
server.registerTool(
  "add",
  {
    title: "Add numbers",
    description: "Returns the sum of two numbers.",
    inputSchema: {
      a: z.number().describe("First number"),
      b: z.number().describe("Second number"),
    },
  },
  async ({ a, b }) => ({
    content: [{ type: "text", text: String(a + b) }],
  })
);

// ---------------------------------------------------------------------------
// Resources – read-only data the AI can surface to users
// ---------------------------------------------------------------------------

/**
 * Example resource: skill info
 * Exposes metadata about this skill as a readable resource.
 */
server.registerResource(
  "skill-info",
  "skill://info",
  {
    title: "Skill information",
    description: "Metadata about this hardkoded skill",
    mimeType: "application/json",
  },
  async () => ({
    contents: [
      {
        uri: "skill://info",
        text: JSON.stringify(
          {
            name: "my-hardkoded-skill",
            version: "0.1.0",
            tools: ["echo", "add"],
          },
          null,
          2
        ),
      },
    ],
  })
);

// ---------------------------------------------------------------------------
// Prompts – reusable templates for interacting with the AI
// ---------------------------------------------------------------------------

/**
 * Example prompt: getting-started
 * A simple prompt template that greets the user.
 */
server.registerPrompt(
  "getting-started",
  {
    title: "Getting started",
    description: "A starter prompt that introduces the skill capabilities",
    argsSchema: {
      userName: z.string().optional().describe("Optional user name"),
    },
  },
  ({ userName }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `Hello${userName ? ` ${userName}` : ""}! I have access to the following tools:\n- echo: echoes a message\n- add: adds two numbers\n\nWhat would you like to do?`,
        },
      },
    ],
  })
);

// ---------------------------------------------------------------------------
// Transport – connect via stdio (default for local use)
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
