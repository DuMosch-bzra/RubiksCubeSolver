import { DEFAULT_SETTINGS, parseSettings, type SolverSettings } from '../cube/solver/methods.ts'

const KEY = 'rubiks-cube-solver.settings'

/** Last used solver settings; storage can be missing or blocked, so every access is guarded. */
export const loadSettings = (): SolverSettings => {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? parseSettings(JSON.parse(raw)) : DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

export const saveSettings = (settings: SolverSettings): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    // Not saved; the app works the same without it.
  }
}
