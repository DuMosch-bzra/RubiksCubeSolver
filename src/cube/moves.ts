import { STICKERS, dot, rotateClockwise, stickerIndex, type Vec3 } from './geometry.ts'
import type { CubeState } from './state.ts'

/**
 * Every move family the notation parser understands.
 * - Face turns:  U D R L F B
 * - Wide turns:  u d r l f b (same as Uw Dw Rw Lw Fw Bw)
 * - Slices:      M (follows L), E (follows D), S (follows F)
 * - Rotations:   x (follows R), y (follows U), z (follows F)
 */
export const BASE_MOVES = [
  'U', 'D', 'R', 'L', 'F', 'B',
  'u', 'd', 'r', 'l', 'f', 'b',
  'M', 'E', 'S',
  'x', 'y', 'z',
] as const
export type BaseMove = (typeof BASE_MOVES)[number]

/** Number of clockwise quarter turns: 1 = X, 2 = X2, 3 = X'. */
export type Amount = 1 | 2 | 3

export interface Move {
  base: BaseMove
  amount: Amount
}

type Layer = (depth: number) => boolean
const outer: Layer = (d) => d === 1
const wide: Layer = (d) => d >= 0
const middle: Layer = (d) => d === 0
const all: Layer = () => true

const X: Vec3 = [1, 0, 0]
const Y: Vec3 = [0, 1, 0]
const Z: Vec3 = [0, 0, 1]
const neg = (v: Vec3): Vec3 => [-v[0], -v[1], -v[2]]

/** Axis the move turns clockwise around, and which layers along it move. */
const MOVE_DEFS: Record<BaseMove, { axis: Vec3; layer: Layer }> = {
  U: { axis: Y, layer: outer },
  D: { axis: neg(Y), layer: outer },
  R: { axis: X, layer: outer },
  L: { axis: neg(X), layer: outer },
  F: { axis: Z, layer: outer },
  B: { axis: neg(Z), layer: outer },
  u: { axis: Y, layer: wide },
  d: { axis: neg(Y), layer: wide },
  r: { axis: X, layer: wide },
  l: { axis: neg(X), layer: wide },
  f: { axis: Z, layer: wide },
  b: { axis: neg(Z), layer: wide },
  M: { axis: neg(X), layer: middle },
  E: { axis: neg(Y), layer: middle },
  S: { axis: Z, layer: middle },
  x: { axis: X, layer: all },
  y: { axis: Y, layer: all },
  z: { axis: Z, layer: all },
}

/**
 * Permutation for one clockwise quarter turn: after the move, sticker slot
 * `j` holds what was in slot `perm[j]`.
 * Generated from 3D geometry instead of hand-written tables, so every move
 * is consistent by construction.
 */
const buildQuarterTurn = (base: BaseMove): number[] => {
  const { axis, layer } = MOVE_DEFS[base]
  const perm = STICKERS.map((_, i) => i)
  STICKERS.forEach((s, from) => {
    if (!layer(dot(s.pos, axis))) return
    const to = stickerIndex({ pos: rotateClockwise(s.pos, axis), normal: rotateClockwise(s.normal, axis) })
    perm[to] = from
  })
  return perm
}

const compose = (first: number[], second: number[]): number[] => second.map((i) => first[i])

/** PERMS[base][amount] for amount 1..3. */
const PERMS = Object.fromEntries(
  BASE_MOVES.map((base) => {
    const q = buildQuarterTurn(base)
    const h = compose(q, q)
    return [base, { 1: q, 2: h, 3: compose(h, q) }]
  }),
) as Record<BaseMove, Record<Amount, number[]>>

export const applyMove = (state: CubeState, move: Move): CubeState => {
  const perm = PERMS[move.base][move.amount]
  let out = ''
  for (let j = 0; j < perm.length; j++) out += state[perm[j]]
  return out
}

export const applyMoves = (state: CubeState, moves: readonly Move[]): CubeState =>
  moves.reduce(applyMove, state)
