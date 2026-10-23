import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

import type { Forecast, Reading } from '../types'

const WINDOW_MS = 5 * 60 * 60 * 1000
const PACE_MS = 45 * 60 * 1000
const MIN_PACE_SPAN_MS = 10 * 60 * 1000
const MIN_ELAPSED_MS = 60 * 1000
const MAX_SHOWN_PERCENT = 300

const reading = atom({ plugin: 'usage-forecast', key: 'reading' } as const, null as Reading | null)

function project({ percentUsed, reset, samples }: Reading, now: number): Forecast | null {
  if (now >= reset) return null

  const first = samples.find(s => now - s.t <= PACE_MS)
  const recent = first && now - first.t >= MIN_PACE_SPAN_MS ? (percentUsed - first.pct) / (now - first.t) : null
  const average = percentUsed / Math.max(now - (reset - WINDOW_MS), MIN_ELAPSED_MS)

  const projected = percentUsed + (recent ?? average) * (reset - now)
  const at = new Date(reset).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  return { projected, at }
}

async function recompute($: EngineInterface, limits: SessionRateLimit[]) {
  const window = limits.find(l => l.kind === 'five_hour')
  if (!window?.resetsAt) return update($, reading, () => null)

  const now = await $.clock.now()
  const previous = (await read($, reading))?.samples ?? []

  const last = previous[previous.length - 1]
  const kept = last && window.percentUsed < last.pct ? [] : previous
  const samples = [...kept, { t: now, pct: window.percentUsed }].filter(s => now - s.t <= PACE_MS)

  await update($, reading, (): Reading => ({
    percentUsed: window.percentUsed,
    reset: Date.parse(window.resetsAt),
    samples,
  }))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await recompute($, (await $.session.usage()).rateLimits)
    return result
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) await recompute($, e.rateLimits)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const beneath = await next(e)
    const current = await read($, reading)
    const f = current && project(current, await $.clock.now())
    if (e.props.hasSurvey || !f) return beneath

    const { Box, Text } = $.ui.resolve(e)
    const over = f.projected >= 100
    const pct = f.projected > MAX_SHOWN_PERCENT ? `>${MAX_SHOWN_PERCENT}` : Math.round(f.projected)

    return (
      <Box flexDirection="column" alignItems="flex-end">
        {beneath}
        <Text color={over ? 'error' : 'success'}>
          {pct}% by {f.at} - {over ? 'SLOW DOWN!' : 'BURN SOME TOKENS!'}
        </Text>
      </Box>
    )
  })
}
