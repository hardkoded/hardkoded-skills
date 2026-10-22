import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { answerText, openSessions, parseStatus, sessionLabel } from './status'
import type { Sent, SessionStatus } from '../types'

const PANE = 'consolidated-inbox'
const POLL_MS = 5000

const SESSIONS = atom({ plugin: 'consolidated-inbox', key: 'sessions' } as const, [] as SessionStatus[])
const SENT = atom({ plugin: 'consolidated-inbox', key: 'sent' } as const, {} as Record<string, Sent>)
const TYPING = atom({ plugin: 'consolidated-inbox', key: 'typing' } as const, null as string | null)

let isOpen = false
let isPolling = false

/** The folder the inbox mod writes to. It must resolve the way the inbox's `exportStatus` does. */
async function statusDir($: EngineInterface): Promise<string> {
  const set = await $.env.get('INBOX_STATUS_DIR')
  if (set) return set
  const config = (await $.env.get('CLAUDE_CONFIG_DIR')) || `${(await $.env.get('HOME')) ?? ''}/.claude`

  return `${config}/inbox/status`
}

async function refresh($: EngineInterface) {
  const dir = await statusDir($)
  // A folder that cannot be listed keeps the last list and the sent marks. One that is not there yet is empty.
  const names = await $.fs.list(dir).then(
    entries => entries.filter(e => e.kind === 'file' && e.name.endsWith('.json')).map(e => e.name),
    (err: unknown) => {
      if ((err as { code?: unknown }).code === 'ENOENT') return [] as string[]
      throw err
    },
  )
  const files = await Promise.all(names.map(name => $.fs.read(`${dir}/${name}`).then(parseStatus, () => null)))
  const found = files.filter((s): s is SessionStatus => s !== null)
  const [now, ownId] = await Promise.all([$.clock.now(), $.session.id()])

  const open = openSessions(found, now, ownId)
  const ids = new Set(open.flatMap(s => s.questions.map(q => `${s.sessionId}:${q.id}`)))

  await update($, SESSIONS, () => open)
  // A sent answer is forgotten once its question leaves the list, so a reused id starts clean.
  await update($, SENT, sent => Object.fromEntries(Object.entries(sent).filter(([key]) => ids.has(key))))
}

/** Reads the status folder every few seconds while the pane is open. */
function poll($: EngineInterface) {
  if (isPolling) return
  isPolling = true
  void (async () => {
    try {
      while (isOpen) {
        await refresh($).catch(() => undefined)
        await $.clock.sleep(POLL_MS)
      }
    } finally {
      isPolling = false
    }
  })().catch(() => undefined)
}

const sending = new Set<string>()

async function answer($: EngineInterface, session: SessionStatus, id: string, ask: string, text: string) {
  const key = `${session.sessionId}:${id}`
  if (sending.has(key)) return
  sending.add(key)
  try {
    const outcome = await $.session.send({ to: { sessionId: session.sessionId }, text: answerText(ask, text) }).then(
      (r): Sent => (r.isDelivered ? { is: 'sent' } : { is: 'failed', reason: r.reason }),
      (err: unknown): Sent => ({ is: 'failed', reason: err instanceof Error ? err.message : String(err) }),
    )

    await Promise.all([
      update($, SENT, s => ({ ...s, [key]: outcome })),
      update($, TYPING, t => (t === key && outcome.is === 'sent' ? null : t)),
    ])
  } finally {
    sending.delete(key)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command
      .register({
        name: 'consolidated-inbox',
        description: 'Answer the open questions of all your sessions',
        immediate: true,
      })
      .catch(() => undefined)

    return next(e)
  })

  on('command.run', { command: 'consolidated-inbox' }, async $ => {
    isOpen = true
    await $.ui.open({ id: PANE, title: 'Consolidated inbox', focus: true, closeOnEscape: true })
    poll($)

    return { text: 'Opened the consolidated inbox.' }
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) isOpen = false

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Button, Text } = elements
    const Input = 'Input' in elements ? elements.Input : null
    const [sessions, sent, typing] = await Promise.all([read($, SESSIONS), read($, SENT), read($, TYPING)])

    if (sessions.length === 0)
      return (
        <Box flexDirection="column" paddingLeft={1}>
          <Text dimColor wrap="wrap">
            No open questions. Sessions with the inbox mod installed show up here when they ask one.
          </Text>
        </Box>
      )

    return (
      <Box flexDirection="column" paddingLeft={1} gap={1}>
        {sessions.map(session => (
          <Box key={session.sessionId} flexDirection="column">
            <Text bold>
              {sessionLabel(session)}
              {session.project ? <Text dimColor> {session.project}</Text> : null}
            </Text>
            {session.questions.map(q => {
              const key = `${session.sessionId}:${q.id}`
              const outcome = sent[key]
              const reply = (text: string) => void answer($, session, q.id, q.ask, text)

              return (
                <Box key={key} flexDirection="column" marginLeft={2} marginTop={1}>
                  <Text wrap="wrap">{q.ask}</Text>
                  {outcome?.is === 'sent' ? (
                    <Box flexDirection="row" columnGap={1}>
                      <Text color="success">Sent. It leaves this list when the session updates.</Text>
                      <Button
                        key={`${key}:again`}
                        plain
                        label="Answer again"
                        onPress={() =>
                          void update($, SENT, s => Object.fromEntries(Object.entries(s).filter(([k]) => k !== key)))
                        }
                      />
                    </Box>
                  ) : (
                    <Box flexDirection="column">
                      {outcome?.is === 'failed' ? (
                        <Text color="error" wrap="wrap">
                          Not sent: {outcome.reason ?? 'the session did not take it'}
                        </Text>
                      ) : null}
                      <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
                        {q.options.map(option => (
                          <Button
                            key={`${key}:${option}`}
                            label={q.rec === option ? `${option} (recommended)` : option}
                            onPress={() => reply(option)}
                          />
                        ))}
                        <Button
                          key={`${key}:type`}
                          plain
                          label="Reply…"
                          onPress={() => void update($, TYPING, t => (t === key ? null : key))}
                        />
                      </Box>
                      {Input && typing === key ? (
                        <Input
                          key={`${key}:input`}
                          placeholder="Your answer"
                          submitLabel="send"
                          autoFocus
                          onSubmit={(value: string) => {
                            if (value.trim()) reply(value.trim())
                          }}
                        />
                      ) : null}
                    </Box>
                  )}
                </Box>
              )
            })}
          </Box>
        ))}
      </Box>
    )
  })
}
