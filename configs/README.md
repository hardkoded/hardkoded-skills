# Platform Configuration Guide

This directory contains configuration snippets for connecting your hardkoded skill
to each supported AI platform.

---

## Claude Desktop

**Config file:** `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)  
`%APPDATA%\Claude\claude_desktop_config.json` (Windows)

Merge the contents of [`claude-desktop.json`](./claude-desktop.json) into your config file,
replacing `/absolute/path/to/skills/...` with the real path on your machine.

After saving, restart Claude Desktop. Your skill will appear in the tool selector.

---

## Cursor

**Config file:** `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project-level)

Merge the contents of [`cursor-mcp.json`](./cursor-mcp.json) into your config file,
replacing `/absolute/path/to/skills/...` with the real path.

Restart Cursor after saving.

---

## GitHub Copilot (VS Code)

**Config file:** `.vscode/mcp.json` (project-level, committed to the repo)  
or `settings.json` under `github.copilot.mcp` (user-level)

Merge the contents of [`vscode-mcp.json`](./vscode-mcp.json) into your workspace
`.vscode/mcp.json`, replacing `/absolute/path/to/skills/...` with the real path.

Reload VS Code. Copilot will detect the MCP server and make the tools available in chat.

---

## Environment variables

If your skill needs secrets (API keys, tokens), pass them via the `env` field in the
MCP config rather than hard-coding them:

```json
{
  "mcpServers": {
    "my-hardkoded-skill": {
      "command": "node",
      "args": ["/path/to/dist/index.js"],
      "env": {
        "MY_API_KEY": "sk-..."
      }
    }
  }
}
```

Read them in your skill with `process.env.MY_API_KEY`.
