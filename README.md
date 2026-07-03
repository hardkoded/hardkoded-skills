# hardkoded-skills

A collection of skills by [hardkoded](https://www.hardkoded.com/) packaged as plugins for Claude, Cursor, GitHub Copilot, and Codex.

## Included skill

`hardkoded-skills` helps users brainstorm random software project ideas.

## Installation

### Claude Code

```bash
/plugin marketplace add hardkoded/hardkoded-skills
/plugin install hardkoded@hardkoded
```

### Cursor

Import this repository as a team marketplace, then install `hardkoded` from the Cursor plugin UI.

### GitHub Copilot (VS Code)

Use **Chat: Install Plugin From Source** and provide:

```text
https://github.com/hardkoded/hardkoded-skills
```

### Codex

```bash
codex plugin marketplace add hardkoded/hardkoded-skills
codex plugin add hardkoded@hardkoded
```

## Repository layout

```text
hardkoded-skills/
├── .claude-plugin/marketplace.json
├── .cursor-plugin/marketplace.json
├── plugin.json
├── plugins/
│   └── hardkoded/
│       ├── .claude-plugin/plugin.json
│       ├── .cursor-plugin/plugin.json
│       ├── .codex-plugin/plugin.json
│       └── skills/
│           └── hardkoded-skills/
│               └── SKILL.md
└── skills/
    └── hardkoded-skills/
        └── SKILL.md
```

## License

MIT
