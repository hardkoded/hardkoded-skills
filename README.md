# hardkoded-skills

A set of great skills built by the guy behind [hardkoded](https://www.hardkoded.com/), powered by the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/).

Each skill in this repo is an MCP server that works with multiple AI assistants out of the box:

| Platform | How it connects |
|---|---|
| **Claude** (Desktop / claude.ai) | MCP stdio server |
| **GitHub Copilot** (VS Code) | MCP stdio / HTTP server |
| **Cursor** | MCP stdio server |

---

## Repository layout

```
hardkoded-skills/
├── template/          # Scaffolding – copy this to create a new skill
│   ├── src/
│   │   └── index.ts   # MCP server with example tools, resources, and prompts
│   ├── package.json
│   ├── tsconfig.json
│   └── README.md
├── configs/           # Platform connection snippets (Claude, Cursor, Copilot)
│   ├── claude-desktop.json
│   ├── cursor-mcp.json
│   ├── vscode-mcp.json
│   └── README.md
└── skills/            # Individual skills live here (one directory per skill)
```

---

## Creating a new skill

### 1. Copy the template

```bash
cp -r template skills/my-awesome-skill
cd skills/my-awesome-skill
```

### 2. Rename the skill

Edit `package.json` — change the `name` field to your skill name.  
Do the same for the `name` field inside `src/index.ts`.

### 3. Install dependencies

```bash
npm install
```

### 4. Implement your tools

Open `src/index.ts` and register your tools, resources, and prompts:

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
npm run build   # outputs to dist/index.js
```

### 6. Connect to your AI assistant

See [`configs/README.md`](configs/README.md) for platform-specific instructions.

---

## MCP concepts

| Concept | Description |
|---|---|
| **Tool** | An action the AI can execute on your behalf (API call, computation, side effect) |
| **Resource** | Read-only data the AI can surface to the user |
| **Prompt** | A reusable message template for consistent AI interactions |

---

## Requirements

- Node.js ≥ 18
- npm ≥ 9

---

## License

MIT
