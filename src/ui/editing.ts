import type { CubeState } from '../cube/state.ts'
import { UNPAINTED } from '../cube/validate.ts'

/** Centres define the colour scheme and can't be repainted. */
export const isCentre = (index: number): boolean => index % 9 === 4

export const paintSticker = (state: CubeState, index: number, paint: string): CubeState =>
  isCentre(index) || state[index] === paint ? state : state.slice(0, index) + paint + state.slice(index + 1)

/** Everything unpainted except the centres. */
export const clearedCube = (state: CubeState): CubeState =>
  [...state].map((c, i) => (isCentre(i) ? c : UNPAINTED)).join('')
