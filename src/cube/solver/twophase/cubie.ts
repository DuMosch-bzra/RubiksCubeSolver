import { CORNER_CUBIES, EDGE_CUBIES, STICKERS, dot, type Vec3 } from '../../geometry.ts'
import { applyMove, type Amount, type Move } from '../../moves.ts'
import { FACES, SOLVED, type CubeState, type Face } from '../../state.ts'
import { UnsolvableCubeError } from '../errors.ts'

/*
 * Piece-level ("cubie") view of the cube, the representation Kociemba's
 * algorithm works on:
 *
 *   cp[i] = which corner sits at corner position i, co[i] = its twist (0-2)
 *   ep[i] = which edge sits at edge position i,     eo[i] = its flip (0-1)
 *
 * Positions and orientation conventions are derived from the sticker
 * geometry, so they're consistent with the rest of the app by construction:
 * - corner stickers are read U/D sticker first, all in the same rotational
 *   direction; twist = where the piece's U/D colour is.
 * - edges: the 8 U/D-layer edges come first (0-7), the 4 middle-layer
 *   ("slice") edges last (8-11). An edge is flipped when its primary colour
 *   (U/D, or F/B for slice edges) isn't on the position's primary sticker.
 *   With this rule only F and B quarter turns flip edges.
 */

export interface CubieCube {
  cp: number[]
  co: number[]
  ep: number[]
  eo: number[]
}

const faceOf = (sticker: number): Face => FACES[Math.floor(sticker / 9)]
const isUD = (c: string) => c === 'U' || c === 'D'
const isFB = (c: string) => c === 'F' || c === 'B'
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

export const CORNER_POSITIONS: readonly number[][] = CORNER_CUBIES.map(([a, b, c]) => {
  const order = dot(STICKERS[a].normal, cross(STICKERS[b].normal, STICKERS[c].normal)) > 0 ? [a, b, c] : [a, c, b]
  const start = order.findIndex((i) => isUD(faceOf(i)))
  return [0, 1, 2].map((k) => order[(start + k) % 3])
})

const isSlicePosition = (e: number[]) => STICKERS[e[0]].pos[1] === 0

export const EDGE_POSITIONS: readonly number[][] = [...EDGE_CUBIES]
  .sort((a, b) => Number(isSlicePosition(a)) - Number(isSlicePosition(b)))
  .map(([a, b]) => (isUD(faceOf(a)) || (!isUD(faceOf(b)) && isFB(faceOf(a))) ? [a, b] : [b, a]))

const HOME_CORNERS = CORNER_POSITIONS.map((c) => c.map((i) => SOLVED[i]))
const HOME_EDGES = EDGE_POSITIONS.map((e) => e.map((i) => SOLVED[i]))
const colourKey = (cs: string[]) => [...cs].sort().join('')
const CORNER_BY_KEY = new Map(HOME_CORNERS.map((c, i) => [colourKey(c), i]))
const EDGE_BY_KEY = new Map(HOME_EDGES.map((e, i) => [colourKey(e), i]))

/** Reads the pieces from a sticker state (centres must be in their home positions). */
export const toCubie = (state: CubeState): CubieCube => {
  const cp: number[] = []
  const co: number[] = []
  CORNER_POSITIONS.forEach((stickers) => {
    const colours = stickers.map((i) => state[i])
    const piece = CORNER_BY_KEY.get(colourKey(colours))
    const twist = colours.findIndex(isUD)
    if (piece === undefined || twist < 0) throw new UnsolvableCubeError('A corner has impossible colours')
    cp.push(piece)
    co.push(twist)
  })
  const ep: number[] = []
  const eo: number[] = []
  EDGE_POSITIONS.forEach((stickers) => {
    const colours = stickers.map((i) => state[i])
    const piece = EDGE_BY_KEY.get(colourKey(colours))
    if (piece === undefined) throw new UnsolvableCubeError('An edge has impossible colours')
    ep.push(piece)
    eo.push(colours[0] === HOME_EDGES[piece][0] ? 0 : 1)
  })
  return { cp, co, ep, eo }
}

export const SOLVED_CUBIE: CubieCube = toCubie(SOLVED)

/** `a` followed by `b` (b is usually a single move). */
export const multiply = (a: CubieCube, b: CubieCube): CubieCube => ({
  cp: b.cp.map((p) => a.cp[p]),
  co: b.cp.map((p, i) => (a.co[p] + b.co[i]) % 3),
  ep: b.ep.map((p) => a.ep[p]),
  eo: b.ep.map((p, i) => (a.eo[p] + b.eo[i]) % 2),
})

/** The 18 face turns in the order the search uses: U, R, F, D, L, B, each as X, X2, X'. */
export const SEARCH_MOVES: readonly Move[] = (['U', 'R', 'F', 'D', 'L', 'B'] as const).flatMap((base) =>
  ([1, 2, 3] as Amount[]).map((amount) => ({ base, amount })),
)

export const MOVE_CUBES: readonly CubieCube[] = SEARCH_MOVES.map((m) => toCubie(applyMove(SOLVED, m)))

// ---------------------------------------------------------------------------
// Coordinates: each part of the state as a single number
// ---------------------------------------------------------------------------

export const N_TWIST = 2187 // 3^7
export const N_FLIP = 2048 // 2^11
export const N_SLICE = 495 // C(12, 4)
export const N_PERM8 = 40320 // 8!
export const N_PERM4 = 24 // 4!

/** Twist of corners 0-6 in base 3 (the last corner's twist follows from the others). */
export const getTwist = (c: CubieCube) => c.co.slice(0, 7).reduce((acc, o) => acc * 3 + o, 0)
export const setTwist = (t: number): number[] => {
  const co = new Array(8).fill(0)
  for (let i = 6; i >= 0; i--, t = Math.floor(t / 3)) co[i] = t % 3
  co[7] = (3 - (co.reduce((a, b) => a + b, 0) % 3)) % 3
  return co
}

/** Flip of edges 0-10 in base 2. */
export const getFlip = (c: CubieCube) => c.eo.slice(0, 11).reduce((acc, o) => acc * 2 + o, 0)
export const setFlip = (f: number): number[] => {
  const eo = new Array(12).fill(0)
  for (let i = 10; i >= 0; i--, f = Math.floor(f / 2)) eo[i] = f % 2
  eo[11] = eo.reduce((a, b) => a + b, 0) % 2
  return eo
}

const binomial = (n: number, k: number): number => {
  if (k < 0 || k > n) return 0
  let r = 1
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1)
  return r
}

/** Which 4 of the 12 edge positions hold slice edges, as a combination rank 0-494. */
export const getSlice = (c: CubieCube): number => {
  let rank = 0
  let k = 0
  c.ep.forEach((piece, pos) => {
    if (piece >= 8) rank += binomial(pos, ++k)
  })
  return rank
}
/** An edge permutation with the slice edges (in order) at the positions of slice rank `s`. */
export const setSlice = (s: number): number[] => {
  const positions: number[] = []
  for (let k = 4, p = 11; k >= 1; k--) {
    while (binomial(p, k) > s) p--
    positions.unshift(p)
    s -= binomial(p, k)
    p--
  }
  let slice = 8
  let other = 0
  return Array.from({ length: 12 }, (_, pos) => (positions.includes(pos) ? slice++ : other++))
}
export const SOLVED_SLICE = getSlice(SOLVED_CUBIE)

/** Lexicographic rank of a permutation of 0..n-1 (identity = 0). */
export const permRank = (p: readonly number[]): number => {
  let r = 0
  for (let i = 0; i < p.length; i++) {
    let smaller = 0
    for (let j = i + 1; j < p.length; j++) if (p[j] < p[i]) smaller++
    r = r * (p.length - i) + smaller
  }
  return r
}
export const permUnrank = (r: number, n: number): number[] => {
  const digits = new Array(n)
  for (let i = n - 1; i >= 0; i--) {
    digits[i] = r % (n - i)
    r = Math.floor(r / (n - i))
  }
  const available = Array.from({ length: n }, (_, i) => i)
  return digits.map((d) => available.splice(d, 1)[0])
}

/** Phase-2 coordinates (only meaningful once phase 1 is done). */
export const getCornerPerm = (c: CubieCube) => permRank(c.cp)
export const getEdgePerm8 = (c: CubieCube) => permRank(c.ep.slice(0, 8))
export const getSlicePerm = (c: CubieCube) => permRank(c.ep.slice(8).map((p) => p - 8))
