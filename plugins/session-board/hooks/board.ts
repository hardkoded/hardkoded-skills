export type State = 'active' | 'idle' | 'waiting'

export type Sub = { id: string; parentId?: string; name?: string; state: 'active' | 'idle'; lastTask?: string; updatedAt: number }

export type Row = {
  sessionId: string
  cwd: string
  branch?: string
  pid?: number
  state: State
  stateSince: number
  updatedAt: number
  title?: string
  goal?: string
  lastTask?: string
  waitingFor?: string
  guess: { goal?: string; lastTask?: string; waitingFor?: string }
  prs: string[]
  subs?: Sub[]
}

export type Change = Partial<Pick<Row, 'state' | 'title' | 'goal' | 'lastTask' | 'waitingFor' | 'branch' | 'pid'>> & {
  guess?: Row['guess']
  addPrs?: string[]
  clearWaiting?: boolean
  sub?: Partial<Sub> & Pick<Sub, 'id'>
  touchSub?: { id: string; lastTask?: string }
  dropSub?: string
  refresh?: boolean
}

export const MAX = 120
export const SUB_STALE_MS = 30 * 60 * 1000
export const PR_URL = /https:\/\/github\.com\/[^\s"'\\]+\/pull\/\d+/g

export const clip = (text: string | undefined): string | undefined => {
  const flat = text?.replace(/\s+/g, ' ').trim().slice(0, MAX)
  return flat ? flat : undefined
}

export const parse = (text: string): Row | undefined => {
  try {
    const row = JSON.parse(text) as Row
    return typeof row.sessionId === 'string' ? row : undefined
  } catch {
    return undefined
  }
}

export const merge = (prev: Row, change: Change, now: number): Row => {
  const next: Row = { ...prev, guess: { ...prev.guess }, updatedAt: now }
  const state = change.state === 'idle' && (change.waitingFor ?? prev.waitingFor) ? 'waiting' : change.state
  if (state && state !== prev.state) {
    next.state = state
    next.stateSince = now
  }
  for (const key of ['title', 'goal', 'lastTask', 'waitingFor', 'branch', 'pid'] as const) {
    if (change[key] !== undefined) (next as Record<string, unknown>)[key] = change[key]
  }
  if (change.clearWaiting) {
    delete next.waitingFor
    delete next.guess.waitingFor
  }
  if (change.guess) next.guess = { ...next.guess, ...change.guess }
  if (change.addPrs) next.prs = [...new Set([...prev.prs, ...change.addPrs])]
  const { touchSub, dropSub } = change
  const sub = change.sub ?? (touchSub && prev.subs?.some(s => s.id === touchSub.id) ? touchSub : undefined)
  if (sub || dropSub || prev.subs) {
    const subs = (prev.subs ?? []).filter(s => s.id !== dropSub && now - s.updatedAt < SUB_STALE_MS)
    const old = subs.find(s => s.id === sub?.id)
    if (sub && dropSub !== sub.id) {
      const entry: Sub = { state: 'active', ...old, ...sub, updatedAt: now }
      next.subs = old ? subs.map(s => (s === old ? entry : s)) : [...subs, entry]
    } else next.subs = subs
    if (!next.subs.length) delete next.subs
  }
  return next
}

export const fresh = (sessionId: string, cwd: string, now: number): Row => ({
  sessionId,
  cwd,
  state: 'idle',
  stateSince: now,
  updatedAt: now,
  guess: {},
  prs: [],
})
