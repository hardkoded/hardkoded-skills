export type Forecast = { projected: number; at: string }

declare module 'claude-code' {
  interface PluginState {
    'usage-forecast': { forecast: Forecast | null }
  }
}
