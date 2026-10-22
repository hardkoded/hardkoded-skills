# inbox

An optional Claude Code mod that gathers the questions, tasks, findings and pull requests waiting on you in one session, with a recommended action on each. Open it with `/inbox`.

This is [petekp/inbox](https://github.com/petekp/inbox) by Pete Petrash (MIT, see `LICENSE`), Claude Code only. Read the upstream README for the full guide.

## Install

```
/plugin install inbox@hardkoded-skills
```

## What changed from upstream

The inbox always writes its open rows to `<config folder>/inbox/status/<session id>.json` (`~/.claude/inbox/status`, or under `CLAUDE_CONFIG_DIR`). Set `INBOX_STATUS_DIR` to write somewhere else. The `consolidated-inbox` mod reads these files.

## Cost

After each Claude reply the inbox makes one Sonnet call to update its list. Your account pays for it.
