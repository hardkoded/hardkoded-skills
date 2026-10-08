import { expect, mock, test } from 'claude-code/testing'
import type { On, SessionRateLimit } from 'claude-code'

const HOUR_MS = 60 * 60 * 1000
const MINUTE_MS = 60 * 1000
const START = Date.parse('2026-10-08T12:00:00Z')

const fiveHour = (percentUsed: number, resetsAt: number): SessionRateLimit[] => [
  { kind: 'five_hour', percentUsed, resetsAt: new Date(resetsAt).toISOString() },
]

const answerMeasure = (on: On) => on('session.measure', (_$, e) => ({ changed: e.changed }))

const answerRender = (on: On) => on('ui.render', () => ({ type: 'Box', props: {}, children: [] }))

const context = { window: 200_000 }
const BAND_PROPS = { hasSurvey: false, isWorking: false, maxRows: 24, bodyColumns: 80, scroll: { offset: 0, bodyRows: 24 }, view: {} }

for (const surface of ['terminal', 'desktop'] as const) {
  test(`shows the projection above the prompt on ${surface}`, async ($, on) => {
    mock.clock(on, { now: START })
    answerMeasure(on)
    answerRender(on)
    await $.session.measure({ context, rateLimits: fiveHour(40, START + 2.5 * HOUR_MS), changed: ['rateLimits'] })

    const band = await $.ui.mount({ plugin: 'usage-forecast', surface, component: 'AbovePrompt', props: BAND_PROPS })
    const text = await band.find({ type: 'Text', text: /% by / })

    expect(text?.text).toContain('80% by')
    expect(text?.text).toContain('BURN SOME TOKENS!')
    expect(text?.props.color).toBe('success')
  })

  test(`uses recent pace and turns red past 100% on ${surface}`, async ($, on) => {
    const reset = START + 1.5 * HOUR_MS
    const clock = mock.clock(on, { now: START })
    answerMeasure(on)
    answerRender(on)
    await $.session.measure({ context, rateLimits: fiveHour(40, reset), changed: ['rateLimits'] })
    await clock.advance(5 * MINUTE_MS)
    await $.session.measure({ context, rateLimits: fiveHour(45, reset), changed: ['rateLimits'] })
    await clock.advance(5 * MINUTE_MS)
    await $.session.measure({ context, rateLimits: fiveHour(50, reset), changed: ['rateLimits'] })

    const band = await $.ui.mount({ plugin: 'usage-forecast', surface, component: 'AbovePrompt', props: BAND_PROPS })
    const text = await band.find({ type: 'Text', text: /% by / })

    expect(text?.text).toContain('130% by')
    expect(text?.text).toContain('SLOW DOWN!')
    expect(text?.props.color).toBe('error')
  })

  test(`a drop in usage starts a new window on ${surface}`, async ($, on) => {
    const reset = START + 4 * HOUR_MS
    const clock = mock.clock(on, { now: START })
    answerMeasure(on)
    answerRender(on)
    await $.session.measure({ context, rateLimits: fiveHour(50, reset), changed: ['rateLimits'] })
    await clock.advance(5 * MINUTE_MS)
    await $.session.measure({ context, rateLimits: fiveHour(60, reset), changed: ['rateLimits'] })
    await clock.advance(5 * MINUTE_MS)
    await $.session.measure({ context, rateLimits: fiveHour(5, reset), changed: ['rateLimits'] })

    const band = await $.ui.mount({ plugin: 'usage-forecast', surface, component: 'AbovePrompt', props: BAND_PROPS })
    const text = await band.find({ type: 'Text', text: /% by / })

    expect(text?.text).toContain('21% by')
  })

  test(`renders nothing without a five-hour reading on ${surface}`, async ($, on) => {
    mock.clock(on, { now: START })
    answerMeasure(on)
    answerRender(on)
    await $.session.measure({ context, rateLimits: [], changed: ['rateLimits'] })

    const band = await $.ui.mount({ plugin: 'usage-forecast', surface, component: 'AbovePrompt', props: BAND_PROPS })

    expect(await band.find({ type: 'Text', text: /% by / })).toBeUndefined()
  })
}
