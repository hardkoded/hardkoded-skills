#!/bin/bash
# Resolve a PR ref to a saved memory and print it for the agent to ingest.
#
# Usage: load-context.sh <pr-ref>
#   pr-ref: repo#number, a PR URL, or a bare number (resolved if unambiguous).
#
# Output (stdout):
#   === PR MEMORY METADATA ===
#   {json: file, current_worktree_path, same_tree, ...entry fields}
#   === PR MEMORY DOCUMENT ===
#   <markdown doc>
# On failure prints a "not found" message and exits non-zero.

set -euo pipefail
source "$(dirname "$0")/common.sh"
init_workspace
detect_worktree

if [ ! -f "$INDEX_FILE" ]; then
    echo "No PR memories saved yet (no index at $INDEX_FILE)." >&2
    exit 1
fi

RAW="${1:-}"
if [ -z "$RAW" ]; then
    echo "Usage: load-context.sh <pr-ref>" >&2
    exit 2
fi

REF="$(normalize_pr_ref "$RAW")" || true

FILE=""
if [[ "$REF" == *"#"* ]]; then
    FILE=$(jq -r --arg r "$REF" '.refs[$r] // empty' "$INDEX_FILE")
else
    # Bare number: match any ref ending in #<number>.
    matches=$(jq -r --arg n "$REF" '.refs | keys[] | select(endswith("#"+$n))' "$INDEX_FILE")
    count=$(printf '%s\n' "$matches" | grep -c . || true)
    if [ "$count" -eq 1 ]; then
        REF="$matches"
        FILE=$(jq -r --arg r "$REF" '.refs[$r] // empty' "$INDEX_FILE")
    elif [ "$count" -gt 1 ]; then
        echo "Ambiguous: #$REF matches multiple PRs:" >&2
        printf '  %s\n' $matches >&2
        echo "Re-run with the full repo#number." >&2
        exit 3
    fi
fi

if [ -z "$FILE" ]; then
    echo "No PR memory found for '$RAW'." >&2
    echo "Available refs:" >&2
    jq -r '.refs | keys[]' "$INDEX_FILE" | sed 's/^/  /' >&2 || true
    exit 4
fi

DOC="$MEMORIES_DIR/$FILE"
entry=$(jq -c --arg f "$FILE" '.entries[$f] // {}' "$INDEX_FILE")

# Decide whether the saved worktree matches where we are now.
saved_wt_path=$(jq -r '.worktree_path // ""' <<<"$entry")
current_path="${WT_PATH:-$WORKSPACE_BASE}"
if [ -z "$saved_wt_path" ] || [ "$saved_wt_path" = "$current_path" ]; then
    same_tree=true
else
    same_tree=false
fi

meta=$(jq -n \
    --arg file "$FILE" \
    --arg doc_path "$DOC" \
    --arg current_worktree_path "${WT_PATH:-}" \
    --arg current_workspace "$WORKSPACE_BASE" \
    --argjson same_tree "$same_tree" \
    --argjson entry "$entry" \
    '{file:$file, doc_path:$doc_path,
      current_worktree_path:(if $current_worktree_path=="" then null else $current_worktree_path end),
      current_workspace:$current_workspace, same_tree:$same_tree} + $entry')

echo "=== PR MEMORY METADATA ==="
echo "$meta"
echo "=== PR MEMORY DOCUMENT ==="
if [ -f "$DOC" ]; then
    cat "$DOC"
else
    echo "(WARNING: index references $FILE but $DOC is missing.)"
fi
