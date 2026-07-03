# Skill Template

This directory is the starting point for building a new **hardkoded skill** powered by the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/).

A single skill built on MCP works with all of the following AI assistants out of the box:

| Platform | Protocol |
|---|---|
| Claude Desktop | MCP (stdio) |
| GitHub Copilot (VS Code) | MCP (stdio / HTTP) |
| Cursor | MCP (stdio) |
| OpenAI / Codex | Plugin manifest + OpenAPI |

---

## Quick start

### 1. Copy this template

```bash
cp -r template skills/my-awesome-skill
cd skills/my-awesome-skill
```

### 2. Rename the skill

Edit `package.json` and change `name` from `my-hardkoded-skill` to your skill name.
Update the `name` field in `src/index.ts` to match.

### 3. Install dependencies

```bash
npm install
```

### 4. Add your tools, resources, and prompts

Open `src/index.ts` and replace the example `echo` and `add` tools with your own logic.

```typescript
server.registerTool(
  "my-tool",
  {
    title: "My tool",
    description: "What this tool does",
    inputSchema: {
      param: z.string().describe("Parameter description"),
    },
  },
  async ({ param }) => ({
    content: [{ type: "text", text: `Result for: ${param}` }],
  })
);
```

### 5. Build

```bash
npm run build
# Output: dist/index.js
```

### 6. Wire up to your AI assistant

See [`../configs/README.md`](../configs/README.md) for platform-specific instructions.

---

## Development

```bash
# Run without building (useful during development)
npm run dev

# Build for production
npm run build

# Start the built server
npm start
```

---

## Project structure

```
template/
├── src/
│   └── index.ts      # MCP server with tools, resources, and prompts
├── package.json
├── tsconfig.json
└── .gitignore
```

---

## MCP concepts

| Concept | Description |
|---|---|
| **Tool** | An action the AI can execute (computation, API calls, side effects) |
| **Resource** | Read-only data the AI can surface to the user |
| **Prompt** | A reusable message template for consistent AI interactions |
