#!/bin/bash
# List all saved PR memories.
# Usage: list-memories.sh

set -euo pipefail
source "$(dirname "$0")/common.sh"
init_workspace

if [ ! -f "$INDEX_FILE" ] || [ "$(jq '.entries | length' "$INDEX_FILE")" -eq 0 ]; then
    echo "No PR memories saved yet."
    exit 0
fi

jq -r '
    .entries | to_entries[]
    | "• \(.value.title // .key)"
      + "\n    file:     \(.key)"
      + "\n    prs:      \((.value.prs // []) | join(", "))"
      + "\n    worktree: \(.value.worktree // "(main workspace)")"
      + "\n    branches: \((.value.branches // {}) | to_entries | map("\(.key)=\(.value)") | join(", "))"
      + "\n    saved:    \(.value.saved_at // "?")\n"
' "$INDEX_FILE"
