import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const PANE = {
  plugin: 'consolidated-inbox',
  surface: 'terminal' as const,
  component: 'Pane' as const,
  requestId: 'consolidated-inbox',
  props: {
    title: 'Consolidated inbox',
    isFocused: true,
    bodyColumns: 80,
    placement: 'dock' as const,
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
}

const status = (sessionId: string, name: string, ask: string, options: string[]) =>
  JSON.stringify({
    version: 1,
    sessionId,
    host: 'claude-code',
    project: `/work/${name}`,
    name,
    updatedAt: 1_000_000,
    items: [{ id: 'i1', kind: 'question', ask, options, rec: options[0] ?? null, at: 900_000 }],
    findings: [],
  })

let relayed: string[] = []

function world(on: On, files: Record<string, string>, delivery: { isDelivered: boolean; reason?: string }) {
  const sends: { to: string; text: string }[] = []
  relayed = []
  on('env.get', (_$, e) => ({ value: e.name === 'HOME' ? '/home/me' : undefined }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 'me' }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.render', ($, e) => $.ui.resolve(e).Box({}))
  on('fs.list', () => ({
    value: Object.keys(files).map(name => ({ name, kind: 'file' as const, size: 1, mtimeMs: 1, isLink: false })),
  }))
  on('fs.read', (_$, e) => ({ value: files[e.path.split('/').at(-1) ?? ''] ?? '' }))
  on('prompt.submit', (_$, e) => {
    relayed.push(e.text)
    return { text: e.text, context: e.context }
  })
  on('session.send', (_$, e) => {
    sends.push({ to: e.to, text: e.text })
    return delivery as never
  })

  return sends
}

test('shows the open questions of other sessions, and an option sends the answer to that session', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const sends = world(
    on,
    {
      'a.json': status('sa', 'greeter', 'Node or Python?', ['Node', 'Python']),
      'me.json': status('me', 'this one', 'Own question?', ['Yes']),
      'junk.json': 'not json',
    },
    { isDelivered: true },
  )

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'consolidated-inbox', args: '' } as never)
  await clock.settle()

  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ text: /Node or Python\?/ })).toBeDefined()
  expect(await pane.find({ text: /Own question\?/ })).toBeUndefined()

  await pane.press({ key: 'sa:i1:Python' })
  await clock.settle()

  expect(sends).toEqual([
    { to: 'sa', text: 'The person answered this from the consolidated inbox. Re "Node or Python?": Python' },
  ])
  expect(await pane.find({ text: /Sent\./ })).toBeDefined()
})

test('a refused send hands the answer to this session’s Claude to send', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const sends = world(
    on,
    { 'a.json': status('sa', 'greeter', 'Ship it?', ['Yes']) },
    { isDelivered: false, reason: 'The server-side auto mode classifier gave no verdict for SendMessage' },
  )

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'consolidated-inbox', args: '' } as never)
  await clock.settle()

  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'sa:i1:Yes' })
  await clock.settle()

  expect(sends.length).toBe(1)
  expect(relayed).toHaveLength(1)
  expect(relayed[0]).toContain('session sa with the SendMessage tool')
  expect(relayed[0]).toContain('Re "Ship it?": Yes')
  expect(await pane.find({ text: /Handed to Claude/ })).toBeDefined()
})

test('a session that is gone shows why nothing was sent, and the options stay', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world(on, { 'a.json': status('sa', 'greeter', 'Ship it?', ['Yes']) }, { isDelivered: false, reason: 'not running' })

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'consolidated-inbox', args: '' } as never)
  await clock.settle()

  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'sa:i1:Yes' })
  await clock.settle()

  expect(await pane.find({ text: /Not sent: not running/ })).toBeDefined()
  expect(await pane.find({ key: 'sa:i1:Yes' })).toBeDefined()
})

test('says so when no session has a question', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world(on, {}, { isDelivered: true })

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'consolidated-inbox', args: '' } as never)
  await clock.settle()

  expect(await (await $.ui.mount(PANE)).find({ text: /No open questions/ })).toBeDefined()
})

test('pressing an answer twice sends it once', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const sends = world(on, { 'a.json': status('sa', 'greeter', 'Ship it?', ['Yes']) }, { isDelivered: true })

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'consolidated-inbox', args: '' } as never)
  await clock.settle()

  const pane = await $.ui.mount(PANE)
  await Promise.all([pane.press({ key: 'sa:i1:Yes' }), pane.press({ key: 'sa:i1:Yes' })])
  await clock.settle()

  expect(sends.length).toBe(1)
})
