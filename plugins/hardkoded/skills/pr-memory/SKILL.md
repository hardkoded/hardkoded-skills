---
name: pr-memory
description: |
  Persist and restore agent session context keyed by pull-request number. `save`
  snapshots the current session as a /handoff-style document — recording the
  worktree, per-repo branches, and every related PR across repos — and `load <pr>`
  re-hydrates that context by ANY of those PR numbers and offers to switch you to
  the saved worktree/branch. Memories whose PRs are all merged are auto-pruned in
  the background.
  Use when the user says "save PR context", "save this session", "remember this for
  <repo>#<n>", "load PR memory", "restore my session for myrepo#123",
  "what was I doing on <repo>#<n>", "pr-memory list", "prune PR memories", or
  "/pr-memory".
arguments:
  - name: command
    description: "save | load | list | gc"
    required: true
  - name: rest
    description: "For save: optional extra PR refs and --title \"...\". For load: a PR ref (repo#number, PR URL, or bare number)."
    required: false
---

# pr-memory

PR-keyed, on-disk session memory. One session that touches `repo-a#123`,
`repo-b#45`, and `repo-c#7` is saved **once**; an index maps each PR ref to
that single document, so you can `load` it back by any of those numbers.

Works standalone in a single git repo with zero setup. If you use a
multi-repo workspace (several sibling repo checkouts, optionally organized
into per-task worktrees), it scales up to cover that too — see
[Workspace detection](#workspace-detection) below.

Storage (local-only, gitignored): `$WORKSPACE_BASE/.claude/pr-memory/`
- `index.json` — `refs` (PR ref → file) + `entries` (per-file metadata)
- `memories/<slug>.md` — the handoff-style docs

All scripts live in `scripts/`, next to this file. Run them by absolute path:

```
bash <skill-dir>/scripts/<script>.sh
```

Where `<skill-dir>` is the directory this `SKILL.md` was read from.

Parse the first token of the arguments as the subcommand.

**Auto-cleanup (every invocation):** Before doing anything else, fire the GC in
the background — fully detached so it NEVER blocks the user:

```
nohup bash <skill-dir>/scripts/gc-memories.sh --quiet >/dev/null 2>&1 &
```

It deletes any memory whose PRs are **all merged** (safe by default: a memory
with any open/closed/uncheckable PR, or no PRs, is kept). Don't wait on it, don't
report it — just launch it and continue with the requested command.

## `save [pr-ref ...] [--title "..."]`

1. **Infer the related PRs from the conversation first — this is the primary
   source.** You have the context the scripts don't: look back over the session
   for PRs you opened (`gh pr create` output), PRs explicitly discussed or pasted,
   and the repos/branches you actually worked on. Collect those as `repo#number`
   refs (or PR URLs). Don't make the user type them, and don't rely on the
   `/tmp` capture guess.
2. Run `scripts/save-context.sh` passing **every** ref you inferred (plus any the
   user named) and `--title` if given. The script treats the refs you pass as
   authoritative; it then augments them — in a worktree it adds the worktree's
   own `.worktree-meta` PRs and `gh`-discovered PRs for its branches, derives the
   repo set, records each repo's branch, upserts the index, and prints a JSON
   object including `target_file` and `exists`. (Only when you pass NO refs does
   it fall back to the fuzzy `/tmp` session-capture file.)
3. Review the `prs` in the returned JSON. If it pulled in something unrelated or
   missed one, re-run step 2 with the corrected explicit set (re-running cleanly
   replaces the refs for this memory — no duplicates).
4. If `exists` is true, **Read `target_file` first** and update it in place
   (don't blow away prior notes). Otherwise create it.
5. Write a `/handoff`-style document to `target_file`: a short YAML metadata
   header (title, prs, worktree, branches, ticket, saved_at — from the JSON),
   then the synthesis — TL;DR, what was built, current state, open items, key
   learnings, and a reference index (paths/URLs/IDs). Follow the `handoff` skill's
   guidance: don't duplicate content that already lives in commits/PRs/plans —
   reference it. Suggest skills the next session should use.
6. Tell the user which PR refs now resolve to this memory.

## `load <pr-ref>`

1. Run `scripts/load-context.sh <pr-ref>`. It resolves the ref (accepts
   `repo#number`, a PR URL, or a bare number) via the index and prints a
   `=== PR MEMORY METADATA ===` JSON block followed by the
   `=== PR MEMORY DOCUMENT ===`. If nothing matches, relay the "not found" output
   and the available refs.
2. Read `same_tree` from the metadata:
   - **`true`** (saved in this worktree/workspace, or no worktree was recorded):
     ingest the document and continue the work from it.
   - **`false`**: the memory was saved in a different tree. **Ask the user**:
     - **(a) Load here** — ingest into the current tree, or
     - **(b) Do nothing** — they'll load it in the other tree (`worktree_path`).

     On (b), stop and take no further action.
3. On a confirmed load, **offer** (never do silently) to checkout the saved
   branches: for each repo in `branches`, `git -C "<worktree_path or
   workspace>/<repo>" checkout <branch>`. Then present the re-hydrated context
   and continue.

## `list`

Run `scripts/list-memories.sh` and show the saved entries (title, PR refs,
worktree, branches, saved-at).

## `gc`

Run `scripts/gc-memories.sh` in the **foreground** and report what it removed.
Same logic as the auto-cleanup, but synchronous so the user sees the result —
use it when they explicitly ask to prune merged memories.

## Workspace detection

`WORKSPACE_BASE` (the directory pr-memory treats as its persistent home) is
resolved in this order:

1. The `WORKSPACE_BASE` env var, if set and it exists.
2. Walking up from `$PWD` (then `$CLAUDE_PROJECT_DIR`) looking for a marker
   file — `.claude/workspace.md` by default, override the name with
   `PR_MEMORY_WORKSPACE_MARKER`. Create this file at the root of a multi-repo
   workspace to opt into multi-repo mode.
3. If `$PWD` is under a per-task worktrees directory (`worktrees/<name>` by
   default, override the dirname with `PR_MEMORY_WORKTREES_DIRNAME`), the
   sibling of that directory that has the marker file.
4. Otherwise, the current git repo's own top level — this is what makes
   pr-memory work standalone with no setup.

Within a worktree, an optional `.worktree-meta` JSON file (`{"repos": [...],
"ticket": ..., "prs": {...}}`) at the worktree root gives `save` richer data
(which repos and PRs belong to this task) than scanning subdirectories for
`.git` would.

`gc`'s merged-PR check needs each PR's `owner/repo` slug for `gh pr view -R`.
It resolves this per repo, in order: the `origin` remote of a local checkout
(if the repo directory still exists on disk), then the `PR_MEMORY_GITHUB_ORG`
env var (set this once if your checkouts might not be present locally), then
the bare repo name as a last resort.
