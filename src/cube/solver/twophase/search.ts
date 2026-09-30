import type { Move } from '../../moves.ts'
import type { CubeState } from '../../state.ts'
import {
  MOVE_CUBES, N_PERM4, N_SLICE, SEARCH_MOVES, SOLVED_SLICE, getCornerPerm, getEdgePerm8, getFlip, getSlice,
  getSlicePerm, getTwist, multiply, toCubie, type CubieCube,
} from './cubie.ts'
import { N_MOVES, N_P2, PHASE2_MOVES, getTables, type Progress } from './tables.ts'

/*
 * Kociemba's two-phase search.
 *
 * Phase 1 (IDA*, all 18 moves) looks for sequences that orient every piece
 * and put the four middle-layer edges into the middle layer. From there
 * the cube can be solved with only U, D and half turns, which is phase 2
 * (IDA*, those 10 moves).
 *
 * Every phase-1 solution of increasing length gets a phase-2 attempt. The
 * first full solution is usually ~22 moves; the search keeps going for
 * shorter ones until it reaches the target length or runs out of time.
 */

export interface TwoPhaseOptions {
  /** Stop as soon as a solution this short is found. */
  targetLength?: number
  /** Stop improving after this long (a solution is always returned). */
  timeLimitMs?: number
  progress?: Progress
}

export interface TwoPhaseMoves {
  phase1: Move[]
  phase2: Move[]
}

const MAX_LENGTH = 30
const face = (m: number) => (m / 3) | 0
const IS_PHASE2 = SEARCH_MOVES.map((_, i) => PHASE2_MOVES.includes(i))

/** Skip a move on the same face as the last one, and fix the order of opposite faces (U D = D U). */
const redundant = (m: number, last: number) => {
  if (last < 0) return false
  const f = face(m)
  const lf = face(last)
  return f === lf || (f % 3 === lf % 3 && f < lf)
}

/** Solves a cube (centres in place, already validated). */
export const twoPhaseSearch = (state: CubeState, options: TwoPhaseOptions = {}): TwoPhaseMoves => {
  const { targetLength = 20, timeLimitMs = 1500, progress } = options
  const T = getTables(progress)
  const start = toCubie(state)
  const deadline = performance.now() + timeLimitMs

  const path1 = new Int32Array(MAX_LENGTH)
  const path2 = new Int32Array(MAX_LENGTH)
  let best: { p1: number[]; p2: number[] } | null = null
  let bound = MAX_LENGTH // longest total length still worth finding
  let stop = false
  let nodes = 0

  const phase1Bound = (tw: number, fl: number, sl: number) =>
    Math.max(T.twistSlicePrune[tw * N_SLICE + sl], T.flipSlicePrune[fl * N_SLICE + sl])
  const phase2Bound = (cp: number, ep: number, sp: number) =>
    Math.max(T.cornerSlicePrune[cp * N_PERM4 + sp], T.edgeSlicePrune[ep * N_PERM4 + sp])

  const phase2 = (cp: number, ep: number, sp: number, n: number, togo: number, last: number): boolean => {
    if (togo === 0) return cp === 0 && ep === 0 && sp === 0
    for (let k = 0; k < N_P2; k++) {
      const m = PHASE2_MOVES[k]
      if (redundant(m, last)) continue
      const ncp = T.cornerMove[cp * N_P2 + k]
      const nep = T.edgeMove[ep * N_P2 + k]
      const nsp = T.slicePermMove[sp * N_P2 + k]
      if (phase2Bound(ncp, nep, nsp) >= togo) continue
      path2[n] = m
      if (phase2(ncp, nep, nsp, n + 1, togo - 1, m)) return true
    }
    return false
  }

  /** Phase 1 reached the subgroup after n1 moves: try to finish within the current bound. */
  const startPhase2 = (n1: number): void => {
    let c: CubieCube = start
    for (let k = 0; k < n1; k++) c = multiply(c, MOVE_CUBES[path1[k]])
    const cp = getCornerPerm(c)
    const ep = getEdgePerm8(c)
    const sp = getSlicePerm(c)
    const last = n1 > 0 ? path1[n1 - 1] : -1
    const maxDepth = bound - n1
    for (let d = phase2Bound(cp, ep, sp); d <= maxDepth; d++) {
      if (phase2(cp, ep, sp, 0, d, last)) {
        best = { p1: Array.from(path1.slice(0, n1)), p2: Array.from(path2.slice(0, d)) }
        bound = n1 + d - 1
        if (n1 + d <= targetLength) stop = true
        return
      }
    }
  }

  const phase1 = (tw: number, fl: number, sl: number, n: number, togo: number, last: number): void => {
    if (stop) return
    if (togo === 0) {
      // In the subgroup. If the last move was a phase-2 move, a shorter phase 1 already covered this.
      if (tw === 0 && fl === 0 && sl === SOLVED_SLICE && (n === 0 || !IS_PHASE2[last])) startPhase2(n)
      return
    }
    if ((++nodes & 0x3fff) === 0 && best && performance.now() > deadline) {
      stop = true
      return
    }
    for (let m = 0; m < N_MOVES; m++) {
      if (redundant(m, last)) continue
      const ntw = T.twistMove[tw * N_MOVES + m]
      const nfl = T.flipMove[fl * N_MOVES + m]
      const nsl = T.sliceMove[sl * N_MOVES + m]
      if (phase1Bound(ntw, nfl, nsl) >= togo) continue
      path1[n] = m
      phase1(ntw, nfl, nsl, n + 1, togo - 1, m)
      if (stop) return
    }
  }

  const tw = getTwist(start)
  const fl = getFlip(start)
  const sl = getSlice(start)
  for (let depth = phase1Bound(tw, fl, sl); depth <= bound && !stop; depth++) {
    phase1(tw, fl, sl, 0, depth, -1)
    if (best && performance.now() > deadline) break
  }
  if (!best) throw new Error('Two-phase search found no solution')
  const found: { p1: number[]; p2: number[] } = best
  return { phase1: found.p1.map((m) => SEARCH_MOVES[m]), phase2: found.p2.map((m) => SEARCH_MOVES[m]) }
}
