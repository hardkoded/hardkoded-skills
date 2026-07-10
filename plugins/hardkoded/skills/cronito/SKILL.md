---
name: cronito
description: |
  Interactive CLI for managing scheduled tasks on your machine, backed by a
  single system cron entry. This skill vendors a prebuilt, dependency-free
  bundle — no npm install needed to use it. Source: github.com/hardkoded/cronito.
  Use when the user says "/cronito", "schedule a task", "list scheduled
  tasks", "cronito status/add/list/edit/remove/logs/dashboard/health/start-loop",
  or wants to set up recurring local automation.
---

# cronito

Interactive CLI for managing scheduled tasks on your machine. Replaces
scattered `crontab -e` entries with one unified, user-friendly interface.

cronito is open source: **[github.com/hardkoded/cronito](https://github.com/hardkoded/cronito)**.
This skill folder vendors a prebuilt copy of it (`dist/cronito.cjs`, a single
dependency-free bundle) — there's nothing to install and no `bin/` entry
point to wire up.

## How this skill is invoked

Always call the wrapper by absolute path, next to this file:

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

**pending-approval-prompts** — List due tasks awaiting a live session
- Used internally by `/cronito start-loop` (see below) — not typically run by hand
- Prints JSON: `[{ id, name, prompt, dueSince, prepOutput? }]`

**complete `<taskId>` --status `<success|failure>` [--duration `<ms>`] [--error `<message>`]** — Record a live-session run's result
- Used internally by `/cronito start-loop` after it executes a claimed prompt

## /cronito start-loop

Some tasks need a live, already-authenticated Claude Code session instead of
running headlessly — e.g. anything that must ask you for approval before
taking an action. These are tasks created with `requiresLiveSession: true`
(via `cronito add`, when you answer yes to "Does this need a live Claude
Code session to run?").

`/cronito start-loop` turns this session into a poller for those tasks,
using `ScheduleWakeup` the same way the `/loop` skill does — no separate
process, survives context compaction.

On `/cronito start-loop`:

1. Run `bash <skill-dir>/cronito.sh pending-approval-prompts`.
2. If it returns tasks, for each one, in this order:
   1. Run `bash -c 'date +%s%3N'` to note a start timestamp (milliseconds since epoch).
   2. If the entry included `prepOutput`, use it instead of recomputing —
      tell the user "a headless prep pass already computed this, reviewing
      it now" and go straight to the parts that need a human.
   3. Execute its `prompt` exactly as if you'd typed it yourself — invoke the
      named skill/slash-command, do the real work, ask the user for
      approval/input wherever that skill would normally ask.
   4. Run `bash -c 'date +%s%3N'` again and subtract the start timestamp to
      get the elapsed `--duration`, then run
      `bash <skill-dir>/cronito.sh complete <taskId> --status=success --duration=<ms elapsed>`
      (or `--status=failure --duration=<ms> --error="<message>"` if it failed).
3. If it returns no tasks, don't narrate an empty poll — just move on.
4. Call `ScheduleWakeup` with `delaySeconds: 270`, `prompt: "/cronito start-loop"`,
   and a `reason` (e.g. "polling cronito for due approval-needed tasks") to
   re-enter this same skill next tick. `reason` is required alongside
   `delaySeconds`/`prompt` — don't omit it. 270 seconds (not 300) keeps it
   inside the prompt-cache window.
5. Stop when the user says so, or via `ScheduleWakeup({ stop: true })`.

**Error handling:** if executing a claimed prompt fails, still call
`cronito complete --status=failure --error=<msg>` before continuing — a
failed run must not wedge the loop or vanish from `cronito logs` silently.
If `pending-approval-prompts` itself errors (cronito crash, corrupt
config), skip this tick and still schedule the next wakeup — a transient
cronito bug shouldn't kill the loop.

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

This skill folder only carries the built artifact. Source, build tooling,
and issue tracking live at
[github.com/hardkoded/cronito](https://github.com/hardkoded/cronito). To
pick up a change from there, rebuild and copy the new `dist/cronito.cjs`
over the one in this skill folder.
