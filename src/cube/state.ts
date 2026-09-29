/**
 * Facelet (sticker) representation of a 3x3 cube.
 *
 * The state is a 54-character string. Faces are stored in the order
 * U R F D L B, 9 stickers each, row-major as seen when looking straight at
 * that face (same layout as Kociemba's facelet notation):
 *
 *              U0 U1 U2
 *              U3 U4 U5
 *              U6 U7 U8
 *   L0 L1 L2   F0 F1 F2   R0 R1 R2   B0 B1 B2
 *   L3 L4 L5   F3 F4 F5   R3 R4 R5   B3 B4 B5
 *   L6 L7 L8   F6 F7 F8   R6 R7 R8   B6 B7 B8
 *              D0 D1 D2
 *              D3 D4 D5
 *              D6 D7 D8
 *
 * Each character is the face letter whose colour the sticker has in the
 * solved state ('U' = the colour of the U centre, and so on). Using a string
 * keeps states immutable, cheap to compare and usable as Map keys, which the
 * OLL/PLL lookup tables will rely on.
 */

export const FACES = ['U', 'R', 'F', 'D', 'L', 'B'] as const
export type Face = (typeof FACES)[number]

export type CubeState = string

export const SOLVED: CubeState = FACES.map((f) => f.repeat(9)).join('')

/** Index of sticker `i` (0-8) on `face`. */
export const facelet = (face: Face, i: number): number => FACES.indexOf(face) * 9 + i

/** The 9 stickers of one face, row-major. */
export const faceStickers = (state: CubeState, face: Face): string => {
  const start = FACES.indexOf(face) * 9
  return state.slice(start, start + 9)
}

/** True when every face shows a single colour (any cube orientation). */
export const isSolved = (state: CubeState): boolean =>
  FACES.every((face) => {
    const s = faceStickers(state, face)
    return [...s].every((c) => c === s[4])
  })
