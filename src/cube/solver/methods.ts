import type { CubeState } from '../state.ts'
import { solveBeginner } from './beginner.ts'
import { DEFAULT_CFOP, solveCFOP, type CfopOptions, type LookMode, type Solution } from './solve.ts'

/*
 * Every solving method the app knows about. The GUI lists these, so a new
 * method becomes selectable by adding an entry here, a case in `solve`, and
 * (if it has options) a field in SolverSettings.
 */

export type MethodId = 'cfop' | 'beginner' | 'two-phase'

export interface MethodInfo {
  id: MethodId
  name: string
  summary: string
  available: boolean
}

export const METHODS: readonly MethodInfo[] = [
  {
    id: 'cfop',
    name: 'CFOP',
    summary: 'Cross, F2L, OLL, PLL: the method most speedcubers use.',
    available: true,
  },
  {
    id: 'beginner',
    name: 'Beginner (layer by layer)',
    summary: 'One layer at a time with a handful of short algorithms. Easy to follow, long solutions.',
    available: true,
  },
  {
    id: 'two-phase',
    name: 'Two-phase (Kociemba)',
    summary: 'Computer search that finds solutions of about 20 moves. Not human-friendly.',
    available: false,
  },
]

export interface SolverSettings {
  method: MethodId
  cfop: CfopOptions
}

export const DEFAULT_SETTINGS: SolverSettings = { method: 'cfop', cfop: DEFAULT_CFOP }

export class MethodNotAvailableError extends Error {
  constructor(method: MethodId) {
    super(`The ${METHODS.find((m) => m.id === method)?.name ?? method} method is not implemented yet`)
    this.name = 'MethodNotAvailableError'
  }
}

/** Solves `state` with the chosen method. */
export const solve = (state: CubeState, settings: SolverSettings = DEFAULT_SETTINGS): Solution => {
  switch (settings.method) {
    case 'cfop':
      return solveCFOP(state, settings.cfop)
    case 'beginner':
      return solveBeginner(state)
    case 'two-phase':
      throw new MethodNotAvailableError(settings.method)
  }
}

const look = (mode: LookMode, step: string) => (mode === 'full' ? `full ${step}` : `2-look ${step}`)

/** Short description for the header, e.g. "CFOP · full OLL · 2-look PLL". */
export const describeSettings = (settings: SolverSettings): string => {
  const method = METHODS.find((m) => m.id === settings.method)?.name ?? settings.method
  if (settings.method !== 'cfop') return method
  return [method, look(settings.cfop.oll, 'OLL'), look(settings.cfop.pll, 'PLL')].join(' · ')
}

const isLook = (v: unknown): v is LookMode => v === 'full' || v === 'two-look'

/** Reads settings from untrusted JSON (e.g. localStorage), falling back to defaults. */
export const parseSettings = (raw: unknown): SolverSettings => {
  const r = (raw ?? {}) as Partial<SolverSettings>
  const method = METHODS.find((m) => m.id === r.method && m.available)?.id ?? DEFAULT_SETTINGS.method
  const cfop = (r.cfop ?? {}) as Partial<CfopOptions>
  return {
    method,
    cfop: {
      oll: isLook(cfop.oll) ? cfop.oll : DEFAULT_CFOP.oll,
      pll: isLook(cfop.pll) ? cfop.pll : DEFAULT_CFOP.pll,
    },
  }
}
