import { compileMoves, type Move } from '../moves.ts'
import { invertAlgorithm, parseAlgorithm } from '../notation.ts'

/*
 * Shortest-path search over "marked" cubes: 54-character strings that only
 * show the pieces a step cares about (everything else '.'). Moves act on
 * a marked string exactly like on a real cube, so a step with a small
 * allowed move set becomes a tiny graph search.
 *
 * Unlike the F2L search, the allowed sequences don't have to be their own
 * inverses (R U R' U' isn't), so the search runs backwards from the goal
 * using each sequence's inverse. The result is the distance *to* the goal
 * for every reachable marking.
 */

export interface Macro {
  moves: Move[]
  apply: (s: string) => string
  undo: (s: string) => string
}

export const macro = (alg: string | Move[]): Macro => {
  const moves = typeof alg === 'string' ? parseAlgorithm(alg) : alg
  return { moves, apply: compileMoves(moves), undo: compileMoves(invertAlgorithm(moves)) }
}

export interface MacroTable {
  macros: Macro[]
  dist: Map<string, number>
}

/** Distances to `goal` (in moves) for every marking that can reach it. */
export const buildMacroTable = (goal: string, macros: Macro[]): MacroTable => {
  const dist = new Map([[goal, 0]])
  const buckets: string[][] = [[goal]]
  for (let d = 0; d < buckets.length; d++) {
    for (const state of buckets[d] ?? []) {
      if (dist.get(state) !== d) continue
      for (const m of macros) {
        const prev = m.undo(state) // applying m to `prev` gives `state`
        const nd = d + m.moves.length
        if ((dist.get(prev) ?? Infinity) <= nd) continue
        dist.set(prev, nd)
        ;(buckets[nd] ??= []).push(prev)
      }
    }
  }
  return { macros, dist }
}

/** Moves (as the macros were written, not simplified) from `marked` to the goal, or undefined if unreachable. */
export const walkMacroTable = ({ macros, dist }: MacroTable, marked: string): Move[] | undefined => {
  let d = dist.get(marked)
  if (d === undefined) return undefined
  const moves: Move[] = []
  let s = marked
  while (d > 0) {
    const m = macros.find((mac) => dist.get(mac.apply(s)) === d! - mac.moves.length)!
    moves.push(...m.moves)
    s = m.apply(s)
    d = dist.get(s)!
  }
  return moves
}
