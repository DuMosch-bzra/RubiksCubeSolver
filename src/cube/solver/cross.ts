import { EDGE_CUBIES } from '../geometry.ts'
import { FACE_TURNS, applyMove, type Move } from '../moves.ts'
import { SOLVED, type CubeState } from '../state.ts'
import { UnsolvableCubeError } from './errors.ts'

/*
 * Optimal cross on the D face.
 *
 * Each cross edge is tracked as a coordinate 0..23 = position (0..11) * 2 + flip,
 * where flip 0 means its D-coloured sticker is on the first sticker of that
 * position. The four edges together give an index into a 24^4 table holding
 * the distance to the solved cross, filled once by breadth-first search from
 * the solved cross (190,080 reachable entries, all <= 8 moves).
 * Solving is then just walking downhill: pick any move that lowers the distance.
 */

const N = 24
const CROSS_SIDES = ['F', 'R', 'B', 'L'] as const

/** EDGE_MOVE[m][coord]: where an edge at `coord` goes under FACE_TURNS[m]. */
const EDGE_MOVE: Int8Array[] = FACE_TURNS.map((move) => {
  const table = new Int8Array(N)
  for (let c = 0; c < N; c++) {
    const [p, f] = [c >> 1, c & 1]
    const marks = Array<string>(54).fill('.')
    marks[EDGE_CUBIES[p][f]] = 'a'
    marks[EDGE_CUBIES[p][1 - f]] = 'b'
    const i = applyMove(marks.join(''), move).indexOf('a')
    const q = EDGE_CUBIES.findIndex((e) => e.includes(i))
    table[c] = q * 2 + EDGE_CUBIES[q].indexOf(i)
  }
  return table
})

const crossCoords = (state: CubeState): number[] =>
  CROSS_SIDES.map((side) => {
    for (let p = 0; p < EDGE_CUBIES.length; p++) {
      const [i, j] = EDGE_CUBIES[p]
      if (state[i] === 'D' && state[j] === side) return p * 2
      if (state[j] === 'D' && state[i] === side) return p * 2 + 1
    }
    throw new UnsolvableCubeError(`The D-${side} edge is missing`)
  })

const encode = (c: readonly number[]) => ((c[0] * N + c[1]) * N + c[2]) * N + c[3]

const step = (index: number, m: number): number => {
  const t = EDGE_MOVE[m]
  const c3 = index % N
  const c2 = Math.floor(index / N) % N
  const c1 = Math.floor(index / (N * N)) % N
  const c0 = Math.floor(index / (N * N * N))
  return ((t[c0] * N + t[c1]) * N + t[c2]) * N + t[c3]
}

const GOAL = encode(crossCoords(SOLVED))
export const CROSS_STATE_COUNT = 12 * 11 * 10 * 9 * 16

let distances: Int8Array | undefined

/** Distance table, built on first use (a few tens of ms). */
const crossTable = (): Int8Array => {
  if (distances) return distances
  const dist = new Int8Array(N ** 4).fill(-1)
  const queue = new Int32Array(CROSS_STATE_COUNT)
  let head = 0
  let tail = 0
  dist[GOAL] = 0
  queue[tail++] = GOAL
  while (head < tail) {
    const cur = queue[head++]
    for (let m = 0; m < FACE_TURNS.length; m++) {
      const next = step(cur, m)
      if (dist[next] === -1) {
        dist[next] = dist[cur] + 1
        queue[tail++] = next
      }
    }
  }
  distances = dist
  return dist
}

export const isCrossSolved = (state: CubeState): boolean => encode(crossCoords(state)) === GOAL

/** Shortest move sequence that solves the D cross (ignores everything else). */
export const solveCross = (state: CubeState): Move[] => {
  const dist = crossTable()
  let index = encode(crossCoords(state))
  if (dist[index] < 0) throw new UnsolvableCubeError('The cross edges are in an impossible arrangement')
  const moves: Move[] = []
  while (dist[index] > 0) {
    const m = FACE_TURNS.findIndex((_, k) => dist[step(index, k)] === dist[index] - 1)
    moves.push(FACE_TURNS[m])
    index = step(index, m)
  }
  return moves
}

/** Number of cross states the table reached (for tests). */
export const crossTableSize = (): number => crossTable().reduce((n, d) => (d >= 0 ? n + 1 : n), 0)
