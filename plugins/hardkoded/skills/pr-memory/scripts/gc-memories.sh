#!/bin/bash
# Garbage-collect PR memories whose PRs are ALL merged.
#
# Designed to run detached in the background (never blocks the user). Safe by
# default: a memory is deleted only when EVERY one of its PRs is conclusively
# MERGED. Any PR that is open, closed, errors, or can't be checked keeps the
# memory. A memory with no PRs is never GC'd (the work isn't "done" yet).
#
# Usage: gc-memories.sh [--quiet]
#   Prints a one-line summary per removed memory to stdout (for the `gc`
#   subcommand) and appends to $PR_MEMORY_DIR/.gc.log. --quiet suppresses stdout.

set -uo pipefail
source "$(dirname "$0")/common.sh"
init_workspace
[ -f "$INDEX_FILE" ] || exit 0

QUIET=false
[ "${1:-}" = "--quiet" ] && QUIET=true

# Single-runner lock so two GC passes don't stomp each other.
LOCK="$PR_MEMORY_DIR/.gc.lock"
mkdir "$LOCK" 2>/dev/null || exit 0
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

command -v gh >/dev/null 2>&1 || exit 0

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" >> "$PR_MEMORY_DIR/.gc.log"; }
say() { $QUIET || echo "$1"; }

# 1. Snapshot: decide which files are fully merged (the slow, network-bound part).
DELETE=()
while IFS= read -r file; do
    [ -n "$file" ] || continue
    entry_wt=$(jq -r --arg f "$file" '.entries[$f].worktree_path // ""' "$INDEX_FILE")
    prs=$(jq -r --arg f "$file" '.entries[$f].prs[]?' "$INDEX_FILE")
    [ -z "$prs" ] && continue          # no PRs -> keep
    all_merged=1
    while IFS= read -r ref; do
        [ -n "$ref" ] || continue
        repo="${ref%%#*}"; num="${ref#*#}"
        dir=""
        [ -n "$entry_wt" ] && [ -d "$entry_wt/$repo" ] && dir="$entry_wt/$repo"
        [ -z "$dir" ] && dir="$(resolve_repo_dir "$repo" || true)"
        slug="$(resolve_repo_slug "$repo" "$dir")"
        state=$(gh pr view "$num" -R "$slug" --json state --jq '.state' 2>/dev/null || echo "")
        if [ "$state" != "MERGED" ]; then all_merged=0; break; fi
    done <<< "$prs"
    [ "$all_merged" -eq 1 ] && DELETE+=("$file")
done <<< "$(jq -r '.entries | keys[]' "$INDEX_FILE")"

[ ${#DELETE[@]} -eq 0 ] && exit 0

# 2. Fast atomic read-modify-write on the CURRENT index (minimizes the window
#    where a concurrent save could be clobbered: all slow work is already done).
del_json=$(printf '%s\n' "${DELETE[@]}" | jq -R . | jq -s .)
tmp="$(mktemp)"
jq --argjson del "$del_json" '
    reduce $del[] as $f (.;
        .refs |= with_entries(select(.value != $f))
        | del(.entries[$f]))
' "$INDEX_FILE" > "$tmp" && mv "$tmp" "$INDEX_FILE"

for f in "${DELETE[@]}"; do
    rm -f "$MEMORIES_DIR/$f"
    log "removed $f (all PRs merged)"
    say "Removed merged memory: $f"
done
