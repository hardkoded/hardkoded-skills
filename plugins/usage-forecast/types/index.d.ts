export type Forecast = { projected: number; at: string }

export type Reading = { percentUsed: number; reset: number; samples: { t: number; pct: number }[] }

declare module 'claude-code' {
  interface PluginState {
    'usage-forecast': { reading: Reading | null }
  }
}
