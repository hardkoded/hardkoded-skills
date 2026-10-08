import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

import type { Forecast } from '../types'

const WINDOW_MS = 5 * 60 * 60 * 1000
const PACE_MS = 45 * 60 * 1000
const MIN_PACE_SPAN_MS = 10 * 60 * 1000
const MIN_ELAPSED_MS = 60 * 1000
const MAX_SHOWN_PERCENT = 300

const forecast = atom({ plugin: 'usage-forecast', key: 'forecast' } as const, null as Forecast | null)

let samples: { t: number; pct: number }[] = []

async function recompute($: EngineInterface, limits: SessionRateLimit[]) {
  const window = limits.find(l => l.kind === 'five_hour')
  if (!window?.resetsAt) return update($, forecast, () => null)

  const now = await $.clock.now()
  const reset = Date.parse(window.resetsAt)

  const last = samples[samples.length - 1]
  if (last && window.percentUsed < last.pct) samples = []
  samples = [...samples, { t: now, pct: window.percentUsed }].filter(s => now - s.t <= PACE_MS)

  const first = samples[0]
  const latest = samples[samples.length - 1]
  const recent =
    first && latest && latest.t - first.t >= MIN_PACE_SPAN_MS
      ? (latest.pct - first.pct) / (latest.t - first.t)
      : null
  const average = window.percentUsed / Math.max(now - (reset - WINDOW_MS), MIN_ELAPSED_MS)
  const rate = recent ?? average

  const projected = window.percentUsed + rate * Math.max(reset - now, 0)
  const at = new Date(reset).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  await update($, forecast, (): Forecast => ({ projected, at }))
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
    const f = await read($, forecast)
    if (e.props.hasSurvey || !f) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const over = f.projected >= 100
    const pct = f.projected > MAX_SHOWN_PERCENT ? `>${MAX_SHOWN_PERCENT}` : Math.round(f.projected)

    return (
      <Box justifyContent="flex-end">
        <Text color={over ? 'error' : 'success'}>
          {pct}% by {f.at} - {over ? 'SLOW DOWN!' : 'BURN SOME TOKENS!'}
        </Text>
      </Box>
    )
  })
}
