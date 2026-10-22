import type { Question, SessionStatus } from '../types'

/** A status file is stale after this long without a write. The inbox removes a file when its session ends, so this only catches a session that crashed. */
export const STALE_MS = 24 * 60 * 60 * 1000

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

const text = (v: unknown): string | null => (typeof v === 'string' ? v : null)

/**
 * A session's open questions, from the file the inbox mod writes (version 1). Null for text that is not such a file.
 * Tasks and findings in the file are left out.
 */
export function parseStatus(raw: string): SessionStatus | null {
  let file: unknown
  try {
    file = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(file) || file.version !== 1 || typeof file.sessionId !== 'string' || !Array.isArray(file.items))
    return null

  const questions = file.items.flatMap((item: unknown): Question[] => {
    if (!isRecord(item) || item.kind !== 'question' || typeof item.id !== 'string' || typeof item.ask !== 'string')
      return []

    return [
      {
        id: item.id,
        ask: item.ask,
        options: Array.isArray(item.options) ? item.options.filter((o): o is string => typeof o === 'string') : [],
        rec: text(item.rec),
        at: typeof item.at === 'number' ? item.at : null,
      },
    ]
  })

  return {
    sessionId: file.sessionId,
    name: text(file.name),
    project: text(file.project),
    updatedAt: typeof file.updatedAt === 'number' ? file.updatedAt : 0,
    questions,
  }
}

/**
 * The sessions worth showing: not this one, not stale, with a question open. The session with the oldest question
 * comes first, since its question has waited longest.
 */
export function openSessions(all: SessionStatus[], now: number, ownId: string): SessionStatus[] {
  const oldest = (s: SessionStatus) => Math.min(...s.questions.map(q => q.at ?? s.updatedAt))

  return all
    .filter(s => s.sessionId !== ownId && s.questions.length > 0 && now - s.updatedAt <= STALE_MS)
    .sort((a, b) => oldest(a) - oldest(b))
}

/** What a session reads when the person answers from the consolidated inbox. Same form as the inbox's own answers. */
export const answerText = (ask: string, answer: string): string =>
  `The person answered this from the consolidated inbox. Re "${ask}": ${answer}`

/**
 * The prompt that has this session's Claude send the answer on. It runs when `session.send` is refused, as in auto
 * mode, which judges a model's SendMessage call but has no request to judge for a mod's.
 */
export const relayText = (sessionId: string, ask: string, answer: string): string =>
  `The person answered a question of another session from the consolidated inbox. Send the message below to session ${sessionId} with the SendMessage tool, word for word, and do nothing else.\n\n${answerText(ask, answer)}`

/** The label for a session: its name, else its folder's name, else the start of its id. */
export const sessionLabel = (s: SessionStatus): string =>
  s.name ?? s.project?.split('/').filter(Boolean).at(-1) ?? s.sessionId.slice(0, 8)
