import { applyMoves, type Move } from '../../moves.ts'
import { orientationFix } from '../../rotation.ts'
import type { CubeState } from '../../state.ts'
import { validateCube } from '../../validate.ts'
import { UnsolvableCubeError } from '../errors.ts'
import type { Solution, SolveStep } from '../solve.ts'
import { twoPhaseSearch, type TwoPhaseMoves, type TwoPhaseOptions } from './search.ts'

export { getTables, tablesReady, type Progress } from './tables.ts'
export { twoPhaseSearch, type TwoPhaseMoves, type TwoPhaseOptions } from './search.ts'

/** Puts the centres home and checks the cube; returns the rotation used and the cube to search. */
export const prepareTwoPhase = (state: CubeState): { fix: Move[]; cube: CubeState } => {
  const fix = orientationFix(state)
  const cube = applyMoves(state, fix)
  const issues = validateCube(cube)
  if (issues.length > 0) throw new UnsolvableCubeError(issues[0].message)
  return { fix, cube }
}

/** Turns the search result into the same step list the other methods produce. */
export const twoPhaseSolution = (fix: Move[], { phase1, phase2 }: TwoPhaseMoves): Solution => {
  const steps: SolveStep[] = []
  if (fix.length > 0) steps.push({ stage: 'orientation', label: 'Rotate to standard orientation', moves: fix })
  steps.push({ stage: 'phase-1', label: 'Phase 1: orient pieces, middle edges to the middle', moves: phase1 })
  steps.push({ stage: 'phase-2', label: 'Phase 2: finish with U, D and half turns', moves: phase2 })
  return { steps, moves: [...fix, ...phase1, ...phase2] }
}

/** Synchronous two-phase solve (builds the tables on first call). The app runs this in a worker. */
export const solveTwoPhase = (state: CubeState, options?: TwoPhaseOptions): Solution => {
  const { fix, cube } = prepareTwoPhase(state)
  return twoPhaseSolution(fix, twoPhaseSearch(cube, options))
}
