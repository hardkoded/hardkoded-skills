import { expect, test } from 'claude-code/testing'

import { PR_URL, clip, fresh, merge, parse } from './board'

const base = fresh('s1', '/work', 100)

test('idle with a pending question settles as waiting', async () => {
  const asked = merge(base, { waitingFor: 'ship it?' }, 110)
  expect(merge(asked, { state: 'idle' }, 120).state).toBe('waiting')
})

test('a new prompt clears the question and keeps the state clock on no change', async () => {
  const waiting = merge(base, { state: 'waiting', waitingFor: 'q', guess: { waitingFor: 'g' } }, 110)
  const next = merge(waiting, { state: 'active', clearWaiting: true }, 130)
  expect(next.waitingFor).toBe(undefined)
  expect(next.guess.waitingFor).toBe(undefined)
  expect(next.stateSince).toBe(130)
  expect(merge(next, { state: 'active' }, 140).stateSince).toBe(130)
})

test('PR urls are deduplicated', async () => {
  const once = merge(base, { addPrs: ['https://github.com/o/r/pull/1'] }, 110)
  expect(merge(once, { addPrs: ['https://github.com/o/r/pull/1', 'https://github.com/o/r/pull/2'] }, 120).prs.length).toBe(2)
})

test('PR url pattern stops at JSON escapes', async () => {
  const found = JSON.stringify({ stdout: 'https://github.com/o/r/pull/9\n' }).match(PR_URL)
  expect(found?.[0]).toBe('https://github.com/o/r/pull/9')
})

test('clip flattens and caps text, parse rejects half-written files', async () => {
  expect(clip('a\n  b')).toBe('a b')
  expect(clip('x'.repeat(500))?.length).toBe(120)
  expect(clip('   ')).toBe(undefined)
  expect(parse('{"sessionId":"s1"')).toBe(undefined)
})

test('subagents are added, updated, nested and dropped', async () => {
  const added = merge(base, { sub: { id: 'a', name: 'review' } }, 110)
  const nested = merge(added, { sub: { id: 'b', parentId: 'a' } }, 120)
  expect(nested.subs?.length).toBe(2)
  const updated = merge(nested, { sub: { id: 'a', lastTask: 'Bash: ls' } }, 130)
  expect(updated.subs?.[0].name).toBe('review')
  expect(updated.subs?.[0].lastTask).toBe('Bash: ls')
  expect(merge(updated, { dropSub: 'a' }, 140).subs?.length).toBe(1)
  expect(merge(merge(updated, { dropSub: 'a' }, 140), { dropSub: 'b' }, 150).subs).toBe(undefined)
})

test('a tool call from an unknown or dropped subagent adds nothing', async () => {
  expect(merge(base, { touchSub: { id: 'x', lastTask: 'Bash' } }, 110).subs).toBe(undefined)
  const added = merge(base, { sub: { id: 'a' } }, 110)
  expect(merge(added, { touchSub: { id: 'a', lastTask: 'Bash' } }, 120).subs?.[0].lastTask).toBe('Bash')
})

test('stale subagents are dropped on the next write', async () => {
  const added = merge(base, { sub: { id: 'a' } }, 110)
  expect(merge(added, { state: 'active' }, 110 + 31 * 60 * 1000).subs).toBe(undefined)
})
