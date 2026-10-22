import { expect, test } from 'claude-code/testing'

import { STALE_MS, answerText, openSessions, parseStatus, sessionLabel } from './status'
import type { SessionStatus } from '../types'

const file = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    version: 1,
    sessionId: 's1',
    host: 'claude-code',
    project: '/work/greet',
    name: 'Greeter',
    updatedAt: 100,
    items: [
      { id: 'i1', kind: 'question', ask: 'Node or Python?', options: ['Node', 'Python'], rec: 'Node', at: 50 },
      { id: 'i2', kind: 'task', ask: 'Run the tests', options: [], rec: null, at: 60 },
    ],
    findings: [],
    ...over,
  })

const session = (sessionId: string, over: Partial<SessionStatus> = {}): SessionStatus => ({
  sessionId,
  name: null,
  project: null,
  updatedAt: 1000,
  questions: [{ id: 'q', ask: 'Q?', options: [], rec: null, at: 500 }],
  ...over,
})

test('parseStatus keeps the questions and drops tasks', () => {
  expect(parseStatus(file())).toEqual({
    sessionId: 's1',
    name: 'Greeter',
    project: '/work/greet',
    updatedAt: 100,
    questions: [{ id: 'i1', ask: 'Node or Python?', options: ['Node', 'Python'], rec: 'Node', at: 50 }],
  })
})

test('parseStatus refuses text that is not a version 1 status file', () => {
  expect(parseStatus('not json')).toBeNull()
  expect(parseStatus(file({ version: 2 }))).toBeNull()
  expect(parseStatus(file({ sessionId: 7 }))).toBeNull()
  expect(parseStatus(file({ items: 'none' }))).toBeNull()
  expect(parseStatus('null')).toBeNull()
})

test('parseStatus skips an item it cannot read and defaults the optional fields', () => {
  const parsed = parseStatus(
    file({ name: undefined, items: [{ kind: 'question' }, { id: 'i3', kind: 'question', ask: 'Ship it?' }] }),
  )
  expect(parsed?.name).toBeNull()
  expect(parsed?.questions).toEqual([{ id: 'i3', ask: 'Ship it?', options: [], rec: null, at: null }])
})

test('openSessions drops this session, stale ones and ones with no question, and puts the oldest question first', () => {
  const now = STALE_MS + 1000
  const sessions = [
    session('new', { questions: [{ id: 'q', ask: 'Q?', options: [], rec: null, at: 900 }] }),
    session('own'),
    session('quiet', { questions: [] }),
    session('stale', { updatedAt: 1 }),
    session('old', { questions: [{ id: 'q', ask: 'Q?', options: [], rec: null, at: 100 }] }),
  ]
  expect(openSessions(sessions, now, 'own').map(s => s.sessionId)).toEqual(['old', 'new'])
})

test('a question with no time sorts by its session’s last write', () => {
  const noTime = session('a', { updatedAt: 200, questions: [{ id: 'q', ask: 'Q?', options: [], rec: null, at: null }] })
  const timed = session('b', { questions: [{ id: 'q', ask: 'Q?', options: [], rec: null, at: 300 }] })
  expect(openSessions([timed, noTime], 1500, 'x').map(s => s.sessionId)).toEqual(['a', 'b'])
})

test('answerText names the question the way the inbox does', () => {
  expect(answerText('Node or Python?', 'Node')).toBe(
    'The person answered this from the consolidated inbox. Re "Node or Python?": Node',
  )
})

test('sessionLabel prefers the name, then the folder, then the id', () => {
  expect(sessionLabel(session('abcdefghij', { name: 'Greeter', project: '/w/greet' }))).toBe('Greeter')
  expect(sessionLabel(session('abcdefghij', { project: '/w/greet/' }))).toBe('greet')
  expect(sessionLabel(session('abcdefghij'))).toBe('abcdefgh')
})
