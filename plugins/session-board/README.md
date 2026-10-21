# session-board

An optional Claude Code mod that shows every open Claude session on one page: its state (working, idle, or waiting for you), goal, last task, branch, subagents nested under their parent, and the status of its pull requests (CI, review, open threads). Waiting sessions sort first.

## Install

```
/plugin install session-board@hardkoded-skills
```

Sessions started before the install need a restart to report.

## Use

Run `/loop 10m /session-board` in one dedicated session. Each run rebuilds the page and publishes it to the same Claude artifact URL.

The mod writes one small file per session to `~/.claude/session-board/`: state, directory, branch, PR links, the text the agent reports, and the latest prompt as a fallback. The page publishes that text, so do not use the board for sessions whose prompts must stay private. The page script needs `gh` logged in to show pull request status.

## Settings

Set `SESSION_BOARD_LABELS=ready,hold` to show a chip on pull requests that carry any of those labels.
