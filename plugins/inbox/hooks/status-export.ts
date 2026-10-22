import type { Session } from '../types'

/** The status file's shape. Another tool reads it, so change it only by adding fields or raising `version`. */
export type StatusFile = {
  version: 1
  sessionId: string
  host: 'claude-code'
  /** The folder the session works in, when the host knows it. */
  project: string | null
  /** The name the person or Claude gave the session, when the host has one. */
  name: string | null
  updatedAt: number
  /** Open questions and tasks, oldest first. */
  items: {
    id: string
    kind: 'question' | 'task'
    ask: string
    options: string[]
    rec: string | null
    at: number | null
  }[]
  /** Open findings, oldest first. */
  findings: {
    id: string
    kind: 'issue' | 'opportunity'
    title: string
    detail: string
    path: string | null
    at: number
  }[]
}

/** The open rows of a session, as the file a reader outside the inbox gets. Closed rows stay out. */
export function statusFile(
  session: Session,
  meta: { host: StatusFile['host']; sessionId: string; project: string | null; name: string | null; now: number },
): StatusFile {
  const { items, findings } = session.ledger

  return {
    version: 1,
    sessionId: meta.sessionId,
    host: meta.host,
    project: meta.project,
    name: meta.name,
    updatedAt: meta.now,
    items: items.map(({ id, kind, ask, options, rec, at }) => ({ id, kind, ask, options, rec, at })),
    findings: findings.map(({ id, kind, title, detail, path, at }) => ({ id, kind, title, detail, path, at })),
  }
}

/** The transcript line types that carry a Claude Code session's name, best first. */
export const NAME_LINES = ['custom-title', 'agent-name', 'ai-title'] as const
const NAME_FIELDS = { 'custom-title': 'customTitle', 'agent-name': 'agentName', 'ai-title': 'aiTitle' } as const

/** The session's name from the name lines of its transcript: the newest line of the best type, else null. */
export function sessionName(nameLines: string): string | null {
  const latest: Partial<Record<(typeof NAME_LINES)[number], string>> = {}
  for (const line of nameLines.split('\n')) {
    try {
      const entry: unknown = JSON.parse(line)
      if (typeof entry !== 'object' || entry === null || !('type' in entry)) continue
      const type = NAME_LINES.find(t => t === entry.type)
      const value = type && (entry as Record<string, unknown>)[NAME_FIELDS[type]]
      if (type && typeof value === 'string' && value) latest[type] = value
    } catch {
      // Not a name line.
    }
  }

  return NAME_LINES.map(t => latest[t]).find(Boolean) ?? null
}
