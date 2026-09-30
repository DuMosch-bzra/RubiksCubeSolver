import {
  MOVE_CUBES, N_FLIP, N_PERM4, N_PERM8, N_SLICE, N_TWIST, SEARCH_MOVES, SOLVED_CUBIE, SOLVED_SLICE, getFlip,
  getSlice, getTwist, multiply, permRank, permUnrank, setFlip, setSlice, setTwist,
} from './cubie.ts'

/*
 * Lookup tables for the two-phase search.
 *
 * Move tables: coordinate x move -> new coordinate, so the search never
 * touches actual pieces.
 * Pruning tables: for a pair of coordinates, the exact number of moves
 * needed to solve that pair. That's a lower bound for the whole cube,
 * which is what lets the search skip almost every branch.
 *
 *   phase 1: twist x slice (1,082,565) and flip x slice (1,013,760), 18 moves
 *   phase 2: corners x slice order (967,680) and U/D edges x slice order
 *            (967,680), only the 10 moves U, U2, U', D, D2, D', R2, L2, F2, B2
 */

export const N_MOVES = 18

/** Indices into SEARCH_MOVES of the moves allowed in phase 2. */
export const PHASE2_MOVES: readonly number[] = SEARCH_MOVES.flatMap((m, i) =>
  m.base === 'U' || m.base === 'D' || m.amount === 2 ? [i] : [],
)
export const N_P2 = PHASE2_MOVES.length // 10

export interface TwoPhaseTables {
  twistMove: Uint16Array
  flipMove: Uint16Array
  sliceMove: Uint16Array
  cornerMove: Uint16Array
  edgeMove: Uint16Array
  slicePermMove: Uint8Array
  twistSlicePrune: Int8Array
  flipSlicePrune: Int8Array
  cornerSlicePrune: Int8Array
  edgeSlicePrune: Int8Array
}

export type Progress = (fraction: number, label: string) => void

/** Moves a single coordinate: build a cube with that coordinate, apply each move, read it back. */
const moveTable = (
  size: number,
  moves: readonly number[],
  build: (x: number) => ReturnType<typeof multiply>,
  read: (c: ReturnType<typeof multiply>) => number,
  Arr: typeof Uint16Array | typeof Uint8Array = Uint16Array,
) => {
  const table = new Arr(size * moves.length)
  for (let x = 0; x < size; x++) {
    const c = build(x)
    moves.forEach((m, k) => {
      table[x * moves.length + k] = read(multiply(c, MOVE_CUBES[m]))
    })
  }
  return table
}

/**
 * Breadth-first distances for the pair (a, b), stored at a * nB + b.
 * Every entry is filled; -1 would mean unreachable.
 */
const pruneTable = (
  nA: number,
  nB: number,
  start: number,
  nMoves: number,
  moveA: ArrayLike<number>,
  moveB: ArrayLike<number>,
): Int8Array => {
  const dist = new Int8Array(nA * nB).fill(-1)
  const queue = new Int32Array(nA * nB)
  let head = 0
  let tail = 0
  dist[start] = 0
  queue[tail++] = start
  while (head < tail) {
    const cur = queue[head++]
    const a = Math.floor(cur / nB)
    const b = cur - a * nB
    const d = dist[cur] + 1
    for (let m = 0; m < nMoves; m++) {
      const next = moveA[a * nMoves + m] * nB + moveB[b * nMoves + m]
      if (dist[next] === -1) {
        dist[next] = d
        queue[tail++] = next
      }
    }
  }
  return dist
}

const ALL = Array.from({ length: N_MOVES }, (_, i) => i)

export const buildTables = (progress: Progress = () => {}): TwoPhaseTables => {
  progress(0, 'Move tables')
  const twistMove = moveTable(N_TWIST, ALL, (t) => ({ ...SOLVED_CUBIE, co: setTwist(t) }), getTwist) as Uint16Array
  const flipMove = moveTable(N_FLIP, ALL, (f) => ({ ...SOLVED_CUBIE, eo: setFlip(f) }), getFlip) as Uint16Array
  const sliceMove = moveTable(N_SLICE, ALL, (s) => ({ ...SOLVED_CUBIE, ep: setSlice(s) }), getSlice) as Uint16Array
  progress(0.1, 'Move tables')
  const cornerMove = moveTable(
    N_PERM8, PHASE2_MOVES, (c) => ({ ...SOLVED_CUBIE, cp: permUnrank(c, 8) }), (c) => permRank(c.cp),
  ) as Uint16Array
  progress(0.2, 'Move tables')
  const edgeMove = moveTable(
    N_PERM8, PHASE2_MOVES, (e) => ({ ...SOLVED_CUBIE, ep: [...permUnrank(e, 8), 8, 9, 10, 11] }), (c) => permRank(c.ep.slice(0, 8)),
  ) as Uint16Array
  const slicePermMove = moveTable(
    N_PERM4, PHASE2_MOVES,
    (s) => ({ ...SOLVED_CUBIE, ep: [0, 1, 2, 3, 4, 5, 6, 7, ...permUnrank(s, 4).map((p) => p + 8)] }),
    (c) => permRank(c.ep.slice(8).map((p) => p - 8)),
    Uint8Array,
  ) as Uint8Array
  progress(0.3, 'Phase 1 distances')
  const twistSlicePrune = pruneTable(N_TWIST, N_SLICE, SOLVED_SLICE, N_MOVES, twistMove, sliceMove)
  progress(0.5, 'Phase 1 distances')
  const flipSlicePrune = pruneTable(N_FLIP, N_SLICE, SOLVED_SLICE, N_MOVES, flipMove, sliceMove)
  progress(0.7, 'Phase 2 distances')
  const cornerSlicePrune = pruneTable(N_PERM8, N_PERM4, 0, N_P2, cornerMove, slicePermMove)
  progress(0.85, 'Phase 2 distances')
  const edgeSlicePrune = pruneTable(N_PERM8, N_PERM4, 0, N_P2, edgeMove, slicePermMove)
  progress(1, 'Ready')
  return {
    twistMove, flipMove, sliceMove, cornerMove, edgeMove, slicePermMove,
    twistSlicePrune, flipSlicePrune, cornerSlicePrune, edgeSlicePrune,
  }
}

let tables: TwoPhaseTables | undefined

/** The tables, built on first use (a few seconds) and kept for the rest of the session. */
export const getTables = (progress?: Progress): TwoPhaseTables => {
  tables ??= buildTables(progress)
  return tables
}

export const tablesReady = (): boolean => tables !== undefined
