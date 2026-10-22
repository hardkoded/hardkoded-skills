export type Question = { id: string; ask: string; options: string[]; rec: string | null; at: number | null }

export type SessionStatus = {
  sessionId: string
  name: string | null
  project: string | null
  updatedAt: number
  questions: Question[]
}

export type Sent = { is: 'sent' | 'failed'; reason?: string }

declare module 'claude-code' {
  interface PluginState {
    'consolidated-inbox': {
      /** The sessions with open questions, oldest question first. */
      sessions: SessionStatus[]
      /** What happened to each answer, by `<session id>:<question id>`. */
      sent: Record<string, Sent>
      /** The `<session id>:<question id>` whose free-text field is open, if any. */
      typing: string | null
    }
  }
}
