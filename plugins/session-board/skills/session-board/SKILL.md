---
name: session-board
description: Rebuild and republish the Session Board artifact, a page listing every open Claude session with its state, goal, last task and PR status. Use for "/session-board", "refresh the session board", or under "/loop 10m /session-board".
---

# Session board

Run in one dedicated session. Output one line per run, no recap.

1. On the first run only, call `mcp__session-board__board_update` with `title: "Session board"` so this session hides itself on the page.
2. Run `node <skill-dir>/scripts/session-board.mjs`. It prints the HTML path (`~/.claude/session-board/board.html`). The script owns the design; do not edit the HTML.
3. Read that file in full, then publish it with the Artifact tool.
   - If `~/.claude/session-board/.artifact-url` exists, read it with the Artifact `read` action (trim the whitespace), then publish with that `url`. Omit `icon`.
   - Otherwise publish new with `icon: "dashboard"` and `description: "Every open Claude session: state, goal, last task and PR status."`, then write the returned URL to `~/.claude/session-board/.artifact-url`.
4. Report the URL and how many sessions are waiting.

If `gh auth status` fails the page shows the reauth command itself. Do not stop the loop for it.
