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
- `pr-memory` — PR-keyed, on-disk session memory. `save` snapshots the
  current session as a handoff-style document (worktree, per-repo branches,
  every related PR), and `load <pr>` re-hydrates it later by any of those PR
  numbers. Works standalone in a single repo, or across a multi-repo
  workspace if you use one. Memories are pruned automatically once every PR
  they reference has merged.

- `user-email` — an optional Claude Code mod that shows the signed-in
  account email above the prompt. Not installed with `hardkoded`; install it
  separately with `/plugin install user-email@hardkoded-skills` if you want it.

- `usage-forecast` — an optional Claude Code mod that projects where the
  5-hour usage window will land at reset, shown above the prompt. Not installed
  with `hardkoded`; install it separately with
  `/plugin install usage-forecast@hardkoded-skills` if you want it.

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
└── plugins/
    └── hardkoded/
        ├── .claude-plugin/plugin.json
        ├── .cursor-plugin/plugin.json
        ├── .codex-plugin/plugin.json
        └── skills/
            ├── cronito/
            │   ├── SKILL.md
            │   ├── cronito.sh
            │   └── dist/cronito.cjs
            └── pr-memory/
                ├── SKILL.md
                └── scripts/
```

Every install path above (Claude, Cursor, Copilot, Codex) resolves skills
through a plugin manifest's `"skills"` field, which points at
`plugins/hardkoded/skills/` — that's the single copy of each skill in this
repo. Each skill only ships its built artifact here — source lives in its
own repo (e.g. [hardkoded/cronito](https://github.com/hardkoded/cronito)).

## License

MIT
