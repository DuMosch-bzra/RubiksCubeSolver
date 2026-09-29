import { applyMoves, type Amount, type Move } from './moves.ts'
import { FACES, SOLVED, facelet, type CubeState } from './state.ts'

const CENTRES = FACES.map((f) => facelet(f, 4))
const centresOf = (s: CubeState) => CENTRES.map((i) => s[i]).join('')
const HOME = centresOf(SOLVED)

/**
 * All 24 cube orientations as the shortest x/y/z sequence reaching them
 * (at most two moves), in breadth-first order so shorter ones come first.
 */
const ROTATIONS: readonly Move[][] = (() => {
  const seen = new Set([HOME])
  const found: Move[][] = [[]]
  for (let i = 0; i < found.length; i++) {
    for (const base of ['x', 'y', 'z'] as const) {
      for (const amount of [1, 2, 3] as Amount[]) {
        const seq = [...found[i], { base, amount }]
        const c = centresOf(applyMoves(SOLVED, seq))
        if (!seen.has(c)) {
          seen.add(c)
          found.push(seq)
        }
      }
    }
  }
  return found
})()

/** Shortest rotation that brings the centres of `state` back home. */
export const orientationFix = (state: CubeState): Move[] => {
  const fix = ROTATIONS.find((r) => centresOf(applyMoves(state, r)) === HOME)
  if (!fix) throw new Error('Centres are not a valid cube orientation')
  return fix
}

/**
 * Appends whatever rotation is needed so the algorithm leaves the centres
 * where they started. Lets the algorithm list use published algorithms that
 * contain a net y, d or r without hand-fixing them.
 */
export const withOrientationRestored = (moves: readonly Move[]): Move[] => [
  ...moves,
  ...orientationFix(applyMoves(SOLVED, moves)),
]
