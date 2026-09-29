import { FACES, type Face } from './state.ts'

/** Integer 3D vector. x points to R, y to U, z to F. */
export type Vec3 = readonly [number, number, number]

export interface Sticker {
  /** Position of the cubie the sticker sits on, each component in {-1, 0, 1}. */
  pos: Vec3
  /** Outward normal of the face the sticker is on. */
  normal: Vec3
}

/** Maps (row, col) of a face in the facelet layout to a cubie position. */
const FACE_LAYOUT: Record<Face, { normal: Vec3; pos: (row: number, col: number) => Vec3 }> = {
  U: { normal: [0, 1, 0], pos: (r, c) => [c - 1, 1, r - 1] },
  R: { normal: [1, 0, 0], pos: (r, c) => [1, 1 - r, 1 - c] },
  F: { normal: [0, 0, 1], pos: (r, c) => [c - 1, 1 - r, 1] },
  D: { normal: [0, -1, 0], pos: (r, c) => [c - 1, -1, 1 - r] },
  L: { normal: [-1, 0, 0], pos: (r, c) => [-1, 1 - r, c - 1] },
  B: { normal: [0, 0, -1], pos: (r, c) => [1 - c, 1 - r, -1] },
}

/** Geometry of all 54 stickers, indexed like CubeState. */
export const STICKERS: readonly Sticker[] = FACES.flatMap((face) =>
  Array.from({ length: 9 }, (_, i) => ({
    pos: FACE_LAYOUT[face].pos(Math.floor(i / 3), i % 3),
    normal: FACE_LAYOUT[face].normal,
  })),
)

export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]

/**
 * Rotates `v` a quarter turn clockwise as seen looking at the cube from the
 * tip of `axis` (the direction an R turn goes when axis = +x).
 * Rodrigues' formula with theta = -90deg: v' = -(axis x v) + axis (axis . v)
 */
export const rotateClockwise = (v: Vec3, axis: Vec3): Vec3 => {
  const c = cross(axis, v)
  const d = dot(axis, v)
  return [-c[0] + axis[0] * d, -c[1] + axis[1] * d, -c[2] + axis[2] * d]
}

const key = (s: Sticker) => `${s.pos.join(',')}|${s.normal.join(',')}`
const INDEX_BY_KEY = new Map(STICKERS.map((s, i) => [key(s), i]))

export const stickerIndex = (s: Sticker): number => {
  const i = INDEX_BY_KEY.get(key(s))
  if (i === undefined) throw new Error(`No sticker at ${key(s)}`)
  return i
}
