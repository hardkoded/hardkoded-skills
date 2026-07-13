#!/bin/bash
# Common functions for pr-memory scripts.
#
# Resolves a "workspace base" — the directory pr-memory treats as the
# persistent home for its store — and, optionally, a "worktree" within it.
# Works standalone in a single git repo (zero config) and scales up to a
# multi-repo workspace if you use one.

# Optional marker file that designates a directory as a multi-repo workspace
# root (e.g. a folder containing several sibling repo checkouts). Override
# with PR_MEMORY_WORKSPACE_MARKER if your workspace uses a different file.
WORKSPACE_MARKER="${PR_MEMORY_WORKSPACE_MARKER:-.claude/workspace.md}"

# Directory name pattern used for per-task worktrees living alongside the
# workspace (e.g. "worktrees/my-feature"). Override with
# PR_MEMORY_WORKTREES_DIRNAME if you use a different convention.
WORKTREES_DIRNAME="${PR_MEMORY_WORKTREES_DIRNAME:-worktrees}"

# Walk up from $1 to find a directory containing the workspace marker.
walk_up_for_marker() {
    local current="$1"
    while [ -n "$current" ] && [ "$current" != "/" ]; do
        if [ -f "$current/$WORKSPACE_MARKER" ]; then
            echo "$current"
            return 0
        fi
        current="$(dirname "$current")"
    done
    return 1
}

detect_workspace_base() {
    if [ -n "${WORKSPACE_BASE:-}" ] && [ -d "${WORKSPACE_BASE:-}" ]; then
        echo "$WORKSPACE_BASE"
        return 0
    fi

    walk_up_for_marker "$PWD" && return 0

    if [ -n "${CLAUDE_PROJECT_DIR:-}" ]; then
        walk_up_for_marker "$CLAUDE_PROJECT_DIR" && return 0
    fi

    # Inside a worktree dir (e.g. "worktrees/<name>"): workspace is the
    # sibling of the worktrees dir that has the marker.
    if [[ "$PWD" =~ (^|/)($WORKTREES_DIRNAME)/ ]]; then
        local base="${PWD%%/"$WORKTREES_DIRNAME"/*}"
        for dir in "$base"/*/; do
            if [ -f "$dir/$WORKSPACE_MARKER" ]; then
                echo "${dir%/}"
                return 0
            fi
        done
    fi

    # No multi-repo workspace convention in play: fall back to the current
    # git repo's own top level, so pr-memory works standalone with zero setup.
    git -C "$PWD" rev-parse --show-toplevel 2>/dev/null && return 0

    return 1
}

# Sets WORKSPACE_BASE, WORKTREE_BASE, PR_MEMORY_DIR, MEMORIES_DIR, INDEX_FILE.
init_workspace() {
    if ! command -v jq >/dev/null 2>&1; then
        echo "Error: jq is required but not found. Install it: brew install jq" >&2
        exit 1
    fi

    WORKSPACE_BASE="$(detect_workspace_base)" || {
        echo "Error: Could not detect a workspace. Run from inside a git repo, or set WORKSPACE_BASE." >&2
        exit 1
    }
    WORKTREE_BASE="$(dirname "$WORKSPACE_BASE")/$WORKTREES_DIRNAME"
    PR_MEMORY_DIR="$WORKSPACE_BASE/.claude/pr-memory"
    MEMORIES_DIR="$PR_MEMORY_DIR/memories"
    INDEX_FILE="$PR_MEMORY_DIR/index.json"
    export WORKSPACE_BASE WORKTREE_BASE PR_MEMORY_DIR MEMORIES_DIR INDEX_FILE
}

# Create the store and an empty index if they don't exist yet.
ensure_store() {
    mkdir -p "$MEMORIES_DIR"
    if [ ! -f "$INDEX_FILE" ]; then
        echo '{"refs":{},"entries":{}}' > "$INDEX_FILE"
    fi

    # In standalone mode WORKSPACE_BASE is a tracked git repo itself, so keep
    # the store out of `git status` via the repo-local exclude file — this
    # never touches a tracked .gitignore, matching the "local-only" promise.
    if [ -e "$WORKSPACE_BASE/.git" ]; then
        local exclude_file
        exclude_file="$(git -C "$WORKSPACE_BASE" rev-parse --git-path info/exclude 2>/dev/null)"
        if [ -n "$exclude_file" ]; then
            mkdir -p "$(dirname "$exclude_file")"
            grep -qxF '.claude/pr-memory/' "$exclude_file" 2>/dev/null || echo '.claude/pr-memory/' >> "$exclude_file"
        fi
    fi
}

# Resolve the local checkout directory for a bare repo name: prefer a
# subdirectory of $WORKSPACE_BASE named after the repo (multi-repo workspace
# layout); if that doesn't exist but $WORKSPACE_BASE is itself a git repo
# (standalone mode), the workspace base IS the repo, regardless of what name
# the ref used. Prints nothing (and returns 1) if neither applies.
resolve_repo_dir() {
    local repo="$1"
    if [ -e "$WORKSPACE_BASE/$repo/.git" ]; then
        echo "$WORKSPACE_BASE/$repo"
        return 0
    fi
    if [ -e "$WORKSPACE_BASE/.git" ]; then
        echo "$WORKSPACE_BASE"
        return 0
    fi
    return 1
}

# Detect the current worktree. Sets WT_NAME, WT_PATH, WT_META (any may be empty).
# Prefers $WORKTREE_PATH exported by the caller, else derives from PWD.
detect_worktree() {
    WT_NAME=""
    WT_PATH=""
    WT_META=""

    if [ -n "${WORKTREE_PATH:-}" ] && [ -d "$WORKTREE_PATH" ]; then
        WT_PATH="$WORKTREE_PATH"
        WT_NAME="$(basename "$WT_PATH")"
    elif [[ "$PWD" == "$WORKTREE_BASE/"* ]]; then
        local rel="${PWD#"$WORKTREE_BASE"/}"
        WT_NAME="${rel%%/*}"
        WT_PATH="$WORKTREE_BASE/$WT_NAME"
    fi

    if [ -n "$WT_PATH" ] && [ -f "$WT_PATH/.worktree-meta" ]; then
        WT_META="$WT_PATH/.worktree-meta"
    fi
}

# Normalize a PR reference to canonical "repo#number".
# Accepts a GitHub PR URL, "repo#number", or a bare number (passed through, rc=1).
# Prints the normalized value; returns 0 if it resolved to repo#number.
normalize_pr_ref() {
    local raw="$1"
    if [[ "$raw" =~ github\.com/[^/]+/([^/]+)/pull/([0-9]+) ]]; then
        echo "${BASH_REMATCH[1]}#${BASH_REMATCH[2]}"
        return 0
    fi
    if [[ "$raw" =~ ^([A-Za-z0-9._-]+)#([0-9]+)$ ]]; then
        echo "${BASH_REMATCH[1]}#${BASH_REMATCH[2]}"
        return 0
    fi
    echo "$raw"
    return 1
}

# Branch currently checked out in <dir>, empty if detached/none.
current_branch() {
    git -C "$1" branch --show-current 2>/dev/null
}

# Resolve "owner/repo" for a bare repo name, used when calling `gh` for a repo
# whose full slug isn't otherwise known. Tries, in order: the git remote of a
# local checkout (if one is passed in and exists), then the
# PR_MEMORY_GITHUB_ORG env var, then the bare repo name as-is (gh may still
# resolve it if run from within that repo, or the caller may accept failure).
resolve_repo_slug() {
    local repo="$1" dir="${2:-}"
    if [ -n "$dir" ] && [ -e "$dir/.git" ]; then
        local url
        url="$(git -C "$dir" remote get-url origin 2>/dev/null || true)"
        if [[ "$url" =~ github\.com[:/]([^/]+)/([^/.]+)(\.git)?$ ]]; then
            echo "${BASH_REMATCH[1]}/${BASH_REMATCH[2]}"
            return 0
        fi
    fi
    if [ -n "${PR_MEMORY_GITHUB_ORG:-}" ]; then
        echo "${PR_MEMORY_GITHUB_ORG}/$repo"
        return 0
    fi
    echo "$repo"
}
