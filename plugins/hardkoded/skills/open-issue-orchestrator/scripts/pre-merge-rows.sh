#!/usr/bin/env bash
# Print the pre-merge check rows from the CodeRabbit walkthrough comment, per
# PR. Prints every Error, Failed, Warning and Inconclusive row, and always the
# Upstream Parity row. CodeRabbit marks status with images (![Passed](...)),
# not emoji, so the status word is read from the image alt text.
# Exit 1 if any PR has an Error or Failed row, no Upstream Parity row, or no
# pre-merge section. Warning and Inconclusive rows are printed but do not fail.
# Also flags a walkthrough last edited before the PR's head commit: its rows
# may be stale (post `@coderabbitai full review`).
# Usage: pre-merge-rows.sh <pr> [<pr>...]
set -u
repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner) || exit 2
cr='select(.user.login=="coderabbitai[bot]") | select(.body | contains("pre_merge_checks_walkthrough_start"))'
status=0
for pr in "$@"; do
  echo "== PR #$pr"
  section=$(gh api "repos/$repo/issues/$pr/comments" --paginate --jq ".[] | $cr | .body" |
    awk '/<!-- pre_merge_checks_walkthrough_start -->/{f=1} f{print} /<!-- pre_merge_checks_walkthrough_end -->/{f=0}')
  if [ -z "$section" ]; then
    echo "no pre-merge section found (not reviewed yet, or the walkthrough changed)"
    status=1
    continue
  fi
  rows=$(printf '%s\n' "$section" | grep -E '^\|' | grep -E '!\[[A-Za-z]+\]' |
    sed -E 's/!\[([A-Za-z]+)\]\([^)]*\)/\1/' | cut -c1-250)
  shown=$(printf '%s\n' "$rows" | grep -Ei '\| *(Error|Failed|Warning|Inconclusive) *\||upstream parity')
  [ -n "$shown" ] && printf '%s\n' "$shown"
  if printf '%s\n' "$rows" | grep -Eiq '\| *(Error|Failed) *\|'; then status=1; fi
  if ! printf '%s\n' "$rows" | grep -qi 'upstream parity'; then
    echo "no Upstream Parity row found"
    status=1
  fi
  [ -z "$shown" ] && echo "all pre-merge rows pass"
  edited=$(gh api "repos/$repo/issues/$pr/comments" --paginate --jq ".[] | $cr | .updated_at" | sort | tail -1)
  head_date=$(gh pr view "$pr" --json commits --jq '.commits[-1].committedDate')
  if [ -n "$edited" ] && [ -n "$head_date" ] && [[ "$edited" < "$head_date" ]]; then
    echo "STALE?: walkthrough last edited $edited, before head commit $head_date"
  fi
done
exit $status
