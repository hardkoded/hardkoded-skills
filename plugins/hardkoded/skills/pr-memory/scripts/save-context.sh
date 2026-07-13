#!/bin/bash
# Gather everything needed to save a PR-memory entry, upsert it into index.json,
# and tell the agent which file to write the handoff-style doc into.
#
# Usage: save-context.sh [--title "..."] [pr-ref ...]
#   pr-ref: extra PR refs to associate (repo#number or a PR URL).
#
# The agent is expected to: read the emitted target_file (if it exists), write a
# /handoff-style document with a YAML metadata header, and report the saved refs.

set -euo pipefail
source "$(dirname "$0")/common.sh"
init_workspace
ensure_store
detect_worktree

TITLE=""
USER_REFS=()
while [ $# -gt 0 ]; do
    case "$1" in
        --title)
            TITLE="${2:-}"; shift 2 ;;
        --title=*)
            TITLE="${1#--title=}"; shift ;;
        *)
            USER_REFS+=("$1"); shift ;;
    esac
done

# --- Collect PR refs ----------------------------------------------------------
# Always-on sources, independent of where we are: user args + this session's
# captured PRs (written by the capture-pr-url.sh hook).
# bash 3.2 (macOS) has no associative arrays, so refs are a plain array deduped
# at the end, and repo->branch is a parallel array of "<repo>\t<branch>" lines.
REFS=()

add_ref() {
    local n; n="$(normalize_pr_ref "$1")" || return 0   # skip bare numbers we can't resolve
    [[ "$n" == *"#"* ]] && REFS+=("$n")
}

for r in "${USER_REFS[@]:-}"; do [ -n "$r" ] && add_ref "$r"; done

# Session-capture is a fuzzy fallback (the /tmp file is picked by "most recent"
# across ALL sessions, so it can include unrelated PRs). Only use it when the
# user gave no explicit refs; otherwise trust exactly what they passed.
if [ ${#USER_REFS[@]} -eq 0 ]; then
    session_prs="$(ls -t /tmp/claude-session-prs-*.txt 2>/dev/null | head -1 || true)"
    if [ -n "$session_prs" ] && [ -f "$session_prs" ]; then
        while IFS= read -r url; do [ -n "$url" ] && add_ref "$url"; done < "$session_prs"
    fi
fi

# --- Collect repos + branches -------------------------------------------------
REPOS=()
REPO_BRANCHES=()
TICKET="null"

if [ -n "$WT_PATH" ]; then
    # In a worktree the worktree IS the scope: take its repos from .worktree-meta
    # (fall back to scanning), record each repo's branch, and discover their PRs.
    if [ -n "$WT_META" ]; then
        while IFS= read -r r; do [ -n "$r" ] && REPOS+=("$r"); done < <(jq -r '.repos[]?' "$WT_META")
        TICKET=$(jq -c '.ticket' "$WT_META" 2>/dev/null || echo null)
        while IFS= read -r url; do [ -n "$url" ] && add_ref "$url"; done \
            < <(jq -r '.prs | to_entries[]? | .value' "$WT_META" 2>/dev/null)
    fi
    if [ ${#REPOS[@]} -eq 0 ]; then
        for d in "$WT_PATH"/*/; do
            [ -e "$d/.git" ] && REPOS+=("$(basename "$d")")
        done
    fi
    for r in "${REPOS[@]:-}"; do
        [ -n "$r" ] || continue
        REPO_BRANCHES+=("$(printf '%s\t%s' "$r" "$(current_branch "$WT_PATH/$r")")")
        if command -v gh >/dev/null 2>&1; then
            url="$( (cd "$WT_PATH/$r" 2>/dev/null && gh pr view --json url --jq '.url' 2>/dev/null) || true )"
            [ -n "$url" ] && add_ref "$url"
        fi
    done
else
    # Main workspace: scope = the repos named by the collected PR refs (NOT a
    # blanket scan of every repo on a feature branch — that's unrelated work).
    while IFS= read -r r; do
        [ -n "$r" ] || continue
        REPOS+=("$r")
        REPO_BRANCHES+=("$(printf '%s\t%s' "$r" "$(current_branch "$(resolve_repo_dir "$r" || echo "$WORKSPACE_BASE/$r")")")")
    done < <(printf '%s\n' "${REFS[@]:-}" | sed -E 's/#.*$//' | awk 'NF' | sort -u)
fi

PRS=()
while IFS= read -r p; do [ -n "$p" ] && PRS+=("$p"); done \
    < <(printf '%s\n' "${REFS[@]:-}" | awk 'NF' | sort -u)

# --- Resolve target file ------------------------------------------------------
# Reuse an existing entry if: same worktree name, or any collected PR already indexed.
existing_file=""
if [ -n "$WT_NAME" ]; then
    existing_file=$(jq -r --arg wt "$WT_NAME" 'first((.entries|to_entries[]|select(.value.worktree==$wt)|.key)) // empty' "$INDEX_FILE")
fi
if [ -z "$existing_file" ]; then
    for p in "${PRS[@]:-}"; do
        existing_file=$(jq -r --arg p "$p" '.refs[$p] // empty' "$INDEX_FILE")
        [ -n "$existing_file" ] && break
    done
fi

if [ -n "$existing_file" ]; then
    SLUG_FILE="$existing_file"
elif [ -n "$WT_NAME" ]; then
    SLUG_FILE="${WT_NAME}.md"
elif [ ${#PRS[@]} -gt 0 ]; then
    SLUG_FILE="$(echo "${PRS[0]}" | tr '#/' '--').md"
else
    SLUG_FILE="main-$(date -u +%Y%m%d-%H%M%S).md"
fi
TARGET_FILE="$MEMORIES_DIR/$SLUG_FILE"
[ -f "$TARGET_FILE" ] && EXISTS=true || EXISTS=false

SAVED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
[ -z "$TITLE" ] && TITLE="${WT_NAME:-${PRS[0]:-untitled}}"

# --- Build JSON for repos/branches/prs ---------------------------------------
repos_json=$(printf '%s\n' "${REPOS[@]:-}" | jq -R 'select(length>0)' | jq -s .)
prs_json=$(printf '%s\n' "${PRS[@]:-}" | jq -R 'select(length>0)' | jq -s .)
branches_json='{}'
for rb in "${REPO_BRANCHES[@]:-}"; do
    [ -n "$rb" ] || continue
    k="${rb%%$'\t'*}"
    v="${rb#*$'\t'}"
    branches_json=$(jq -n --arg k "$k" --arg v "$v" --argjson o "$branches_json" '$o + {($k): $v}')
done

entry=$(jq -n \
    --arg title "$TITLE" \
    --argjson ticket "$TICKET" \
    --arg worktree "$WT_NAME" \
    --arg worktree_path "$WT_PATH" \
    --argjson repos "$repos_json" \
    --argjson branches "$branches_json" \
    --argjson prs "$prs_json" \
    --arg saved_at "$SAVED_AT" \
    '{title:$title, ticket:$ticket,
      worktree:(if $worktree=="" then null else $worktree end),
      worktree_path:(if $worktree_path=="" then null else $worktree_path end),
      repos:$repos, branches:$branches, prs:$prs, saved_at:$saved_at}')

# --- Upsert index: drop stale refs to this file, then re-point all current prs.
tmp="$(mktemp)"
jq --arg file "$SLUG_FILE" --argjson entry "$entry" --argjson refs "$prs_json" '
    .refs |= with_entries(select(.value != $file))
    | .entries[$file] = $entry
    | reduce $refs[] as $r (.; .refs[$r] = $file)
' "$INDEX_FILE" > "$tmp" && mv "$tmp" "$INDEX_FILE"

# --- Emit instructions for the agent -----------------------------------------
jq -n \
    --arg target_file "$TARGET_FILE" \
    --argjson exists "$EXISTS" \
    --argjson entry "$entry" \
    '{target_file:$target_file, exists:$exists} + $entry'
