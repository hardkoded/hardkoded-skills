# Agent brief (open-issue-orchestrator)

The orchestrator copies this file into each subagent's prompt, with the
placeholders filled in. A subagent may not see the user's global instructions
or the orchestrator's skill, so everything it needs is here.

## Task

- Issue: `#<n>` `<title>` `<url>`, with the full body pasted below
- Branch from the latest `main`. Never reuse an old branch. Name it
  `issue-<n>-<short-slug>`
- Upstream: `<what upstream means for this repo>`. Follow it. Do not fix
  upstream problems in the PR. Report each one (file, what is wrong, why)
- Push rules: `<copied word for word from the user's global instructions>`
- Pre-merge checks: `<each CodeRabbit custom check name and instructions,
  word for word>`. Make every `error` mode check pass on the first review
- Make minor decisions alone and record them in the PR description. Report back
  instead of guessing on a critical question
- Reply to every review comment you disagree with, in that comment's thread,
  with the reason. Only reply. Never resolve a review thread (see "Resolve
  review threads" in the skill)

## PR rules

- Start the PR description with the story (what changed and why)
- Closing keyword: `Closes #<n>` only when the PR fully delivers the issue.
  When it delivers part of it, use `Refs #<n>` and say what is left
- Write the PR body with `gh api -X PATCH repos/{owner}/{repo}/pulls/<pr> -F body=@<unique temp file>`.
  Use a temp file name that no other agent uses (include the issue number)

## Closing checklist

Fill this in as the last part of your final report. Every line is `done`,
`n/a` with a reason, or `skipped` with a reason. Do not report back with a
line left empty.

- [ ] `upstream-parity-check` run through the Skill tool (not by hand), and
      every gap fixed or listed. Run it again after any later edit, including
      docs-only edits
- [ ] Lint and format check, and the tests, pass
- [ ] Every code review the push rules require was actually run (name each
      one), and its findings fixed or answered
- [ ] Test layout follows the repo rule (`CLAUDE.md`, reviewer config)
- [ ] Repo skill file, docs site, and compatibility table updated when the
      public surface changed
- [ ] Real-model run done when the change touches agent, cache, replay, or web
      behavior (or `n/a`)
- [ ] PR body written with `gh api -X PATCH` and a unique temp file
- [ ] `@coderabbitai review` posted after any push that fixed a CodeRabbit
      finding
- [ ] Closing keyword matches what the PR delivers (`Closes` or `Refs`)

## Final report

End with the PR URL and the exact next check the orchestrator should run
(for example "wait for the CodeRabbit round on `<sha>`"). Never end with
"waiting on my own background work": a hand-back means you are done until the
orchestrator messages you. Do not start background pollers. The orchestrator
watches the PR.
