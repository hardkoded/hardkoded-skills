#!/usr/bin/env bash
# Print the pre-merge check rows that are not passing, per PR, from the
# CodeRabbit walkthrough comment. Exit 1 if any PR has a non-passing row or no
# pre-merge section at all.
# Usage: pre-merge-rows.sh <pr> [<pr>...]
set -u
repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner) || exit 2
status=0
for pr in "$@"; do
  echo "== PR #$pr"
  section=$(gh api "repos/$repo/issues/$pr/comments" --paginate \
    --jq '.[] | select(.user.login=="coderabbitai[bot]") | .body' |
    awk '/<!-- pre_merge_checks_walkthrough_start -->/{f=1} f{print} /<!-- pre_merge_checks_walkthrough_end -->/{f=0}')
  if [ -z "$section" ]; then
    echo "no pre-merge section found (not reviewed yet, or the walkthrough changed)"
    status=1
    continue
  fi
  rows=$(printf '%s\n' "$section" | grep -v '✅' | grep -Ev '^\s*$|^<!--|^\|[ :-]*\|[ :-]*\|[ :-]*\|?\s*$')
  if [ -n "$rows" ]; then
    printf '%s\n' "$rows"
    status=1
  else
    echo "all pre-merge rows pass"
  fi
done
exit $status
