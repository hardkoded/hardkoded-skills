# hardkoded-skills

A collection of skills by [hardkoded](https://www.hardkoded.com/) packaged as plugins for Claude, Cursor, GitHub Copilot, and Codex.

## Included skills

This is a growing collection — more skills will land here over time.
Currently:

- `cronito` — an interactive CLI for managing scheduled tasks on your
  machine, backed by a single system cron entry. This skill vendors a
  prebuilt, dependency-free bundle, so there's nothing to install to use it.
  Source lives at [hardkoded/cronito](https://github.com/hardkoded/cronito).
  Run `/cronito init` once to set it up.

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
│           └── cronito/
│               ├── SKILL.md
│               ├── cronito.sh
│               └── dist/cronito.cjs
└── skills/
    └── cronito/
        ├── SKILL.md
        ├── cronito.sh
        └── dist/cronito.cjs
```

Each skill here only ships its built artifact — source lives in its own
repo (e.g. [hardkoded/cronito](https://github.com/hardkoded/cronito)).

## License

MIT
