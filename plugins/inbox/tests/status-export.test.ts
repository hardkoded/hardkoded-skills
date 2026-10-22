import { describe, expect, test as it } from 'claude-code/testing'

import { emptySession } from '../hooks/session'
import { sessionName, statusFile } from '../hooks/status-export'

const line = (type: string, field: string, value: string) => JSON.stringify({ type, [field]: value })

describe('sessionName', () => {
  it('prefers a custom title, then an agent name, then an AI title', () => {
    const all = [
      line('ai-title', 'aiTitle', 'ai'),
      line('agent-name', 'agentName', 'agent'),
      line('custom-title', 'customTitle', 'mine'),
    ]
    expect(sessionName(all.join('\n'))).toBe('mine')
    expect(sessionName(all.slice(0, 2).join('\n'))).toBe('agent')
    expect(sessionName(all[0]!)).toBe('ai')
  })

  it('takes the newest line of a type and skips lines it cannot read', () => {
    const text = [line('ai-title', 'aiTitle', 'old'), 'not json', line('ai-title', 'aiTitle', 'new')].join('\n')
    expect(sessionName(text)).toBe('new')
  })

  it('is null with no name lines', () => {
    expect(sessionName('')).toBeNull()
  })
})

describe('statusFile', () => {
  it('holds the open rows and the meta', () => {
    const session = emptySession()
    session.ledger.items.push({
      id: 'i1',
      kind: 'question',
      label: null,
      ask: 'Which?',
      options: ['a'],
      rec: 'a',
      helps: [],
      turn: 1,
      at: 5,
      from: 'record',
    })
    const file = statusFile(session, { host: 'claude-code', sessionId: 's1', project: '/p', name: 'n', now: 9 })
    expect(file).toMatchObject({
      version: 1,
      sessionId: 's1',
      host: 'claude-code',
      project: '/p',
      name: 'n',
      updatedAt: 9,
    })
    expect(file.items).toEqual([{ id: 'i1', kind: 'question', ask: 'Which?', options: ['a'], rec: 'a', at: 5 }])
    expect(file.findings).toEqual([])
  })
})
