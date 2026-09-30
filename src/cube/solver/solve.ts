import type { CaseTable } from '../cases/caseTable.ts'
import { OLL_CORNERS_2LOOK, OLL_EDGES_2LOOK, OLL_FULL, PLL_CORNERS_2LOOK, PLL_EDGES_2LOOK, PLL_FULL } from '../cases/tables.ts'
import { applyMoves, type Move } from '../moves.ts'
import { simplifyMoves } from '../notation.ts'
import { orientationFix } from '../rotation.ts'
import { SOLVED, type CubeState } from '../state.ts'
import { solveCross } from './cross.ts'
import { UnsolvableCubeError } from './errors.ts'
import { solveF2L } from './f2l.ts'

export type Stage =
  | 'orientation'
  | 'cross'
  | 'f2l'
  | 'oll'
  | 'pll'
  | 'first-layer'
  | 'second-layer'
  | 'last-layer'
  | 'phase-1'
  | 'phase-2'

export interface SolveStep {
  stage: Stage
  /** Human-readable step name, e.g. "F2L: FR pair" or "OLL (corners)". */
  label: string
  /** Recognised case for table steps ("Sune", "T", "skip"). */
  caseName?: string
  moves: Move[]
}

export interface Solution {
  steps: SolveStep[]
  /** All steps joined and simplified across step boundaries. */
  moves: Move[]
}

/** 'two-look' = two smaller steps with few algorithms, 'full' = one algorithm per case. */
export type LookMode = 'two-look' | 'full'

export interface CfopOptions {
  oll: LookMode
  pll: LookMode
}

export const DEFAULT_CFOP: CfopOptions = { oll: 'full', pll: 'full' }

/**
 * CFOP: cross on D, F2L, OLL, then PLL.
 * Throws UnsolvableCubeError when the state can't come from a real cube
 * (flipped edge, twisted corner, swapped pieces, duplicated stickers).
 */
export const solveCFOP = (start: CubeState, options: Partial<CfopOptions> = {}): Solution => {
  const { oll, pll } = { ...DEFAULT_CFOP, ...options }
  const steps: SolveStep[] = []
  let state = start
  const push = (step: SolveStep) => {
    steps.push(step)
    state = applyMoves(state, step.moves)
  }

  const fix = orientationFix(state)
  if (fix.length > 0) push({ stage: 'orientation', label: 'Rotate to standard orientation', moves: fix })

  push({ stage: 'cross', label: 'Cross', moves: solveCross(state) })

  for (const { slot, moves } of solveF2L(state)) push({ stage: 'f2l', label: `F2L: ${slot} pair`, moves })

  const lastLayer = (stage: Stage, label: string, table: CaseTable) => {
    const hit = table.lookup(state)
    if (!hit) throw new UnsolvableCubeError(`${label}: no matching case, the last layer is impossible`)
    push({ stage, label, caseName: hit.caseName, moves: simplifyMoves(hit.moves) })
  }
  if (oll === 'full') {
    lastLayer('oll', 'OLL', OLL_FULL)
  } else {
    lastLayer('oll', 'OLL (edges)', OLL_EDGES_2LOOK)
    lastLayer('oll', 'OLL (corners)', OLL_CORNERS_2LOOK)
  }
  if (pll === 'full') {
    lastLayer('pll', 'PLL', PLL_FULL)
  } else {
    lastLayer('pll', 'PLL (corners)', PLL_CORNERS_2LOOK)
    lastLayer('pll', 'PLL (edges)', PLL_EDGES_2LOOK)
  }

  if (state !== SOLVED) throw new UnsolvableCubeError('The cube could not be solved, the state is probably invalid')
  return { steps, moves: simplifyMoves(steps.flatMap((s) => s.moves)) }
}
