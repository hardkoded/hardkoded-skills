---
name: cronito
description: |
  Interactive CLI for managing scheduled tasks on your machine, backed by a
  single system cron entry. Fully self-contained — no global npm install, no
  external repo, just a bundled script inside this skill folder.
  Use when the user says "/cronito", "schedule a task", "list scheduled
  tasks", "cronito status/add/list/edit/remove/logs/dashboard/health", or
  wants to set up recurring local automation.
---

# cronito

Interactive CLI for managing scheduled tasks on your machine. Replaces
scattered `crontab -e` entries with one unified, user-friendly interface.

## How this skill is invoked

This skill ships its own runnable code — `dist/cronito.cjs`, a single
dependency-free bundle — plus a wrapper script. There is nothing to install
globally and no `bin/` entry point. Always call the wrapper by absolute path,
next to this file:

```
bash <skill-dir>/cronito.sh <command> [args]
```

Where `<skill-dir>` is the directory this `SKILL.md` was read from — e.g. if
this file lives at `~/.claude/skills/cronito/SKILL.md`, run:

```
bash ~/.claude/skills/cronito/cronito.sh list
```

## Setup

Run this once per machine:

**init** — Set up cronito
- Creates `~/.cronito/` if missing
- Migrates any legacy `~/.mabl-scheduler/` data (config + history) if present
- Installs the system cron entry that drives task execution, pointed at this
  skill's own `dist/cronito.cjs` — replacing any old `mabl-scheduler` entry
- Safe to re-run; it's idempotent
- `Example: /cronito init`

## Commands

**add** — Create a new scheduled task
- Interactive prompts guide you through setup
- Specify task name, command, working directory, and schedule
- `Example: /cronito add`

**list** — Show all scheduled tasks
- Displays tasks in a formatted table
- Shows status, ID, name, command, cron expression, and last run result
- `Example: /cronito list`

**edit <taskId>** — Modify an existing task
- Interactive prompts let you update any field
- Pass the 8-char task ID shown in list
- `Example: /cronito edit abc12345`

**remove <taskId>** — Delete a scheduled task
- Asks for confirmation before removing
- `Example: /cronito remove abc12345`

**enable <taskId>** / **disable <taskId>** — Pause without deleting
- Enable a disabled task or disable an enabled task
- `Example: /cronito enable abc12345`

**logs [taskId]** — View execution history
- Without taskId: show recent 20 executions across all tasks
- With taskId: show that task's execution history
- Shows timestamp, status (✓ success, ✗ failure), duration, and errors
- `Example: /cronito logs abc12345`

**status** — Show scheduler status and what's coming up
- Displays total task count (enabled/disabled)
- Shows next 5 tasks to run with countdown timers
- `Example: /cronito status`

**dashboard** — Comprehensive metrics view (runs, success rate, stalled tasks)

**health** — Quick health check (config, recent executions, failure rate, stalled tasks)

## Schedule Formats (Cron)

When you add a task, choose from presets or enter a custom cron expression.

**Common presets:**
- `* * * * *` — Every minute
- `*/5 * * * *` — Every 5 minutes
- `0 * * * *` — Every hour
- `0 9 * * *` — Daily at 9 AM
- `0 8 * * 1` — Every Monday at 8 AM

**Format:** `minute hour day month day-of-week`

## Storage

Configuration is stored in `~/.cronito/`:
- `config.json` — Task definitions
- `history.jsonl` — Execution logs

## System Integration

One system cron entry runs the scheduler check every minute:
```
* * * * * <node> <skill-dir>/dist/cronito.cjs run
```

This entry is installed (and any legacy `mabl-scheduler` entry replaced) when
you run `/cronito init`.

## Notifications

macOS notifications are sent on task failure by default (`notifyOnFailure`,
opt-out) and optionally on success (`notifyOnSuccess`, opt-in). No-op on
non-macOS platforms.

## Development

Source lives in `src/`. To rebuild the bundle after changing source:

```
cd <skill-dir> && npm install && npm run build
```

This regenerates `dist/cronito.cjs`. Only that bundle is needed at runtime —
`node_modules/`, `src/`, and the TypeScript toolchain are build-time only.
