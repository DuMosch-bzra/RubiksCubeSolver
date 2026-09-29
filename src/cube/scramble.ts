import type { Amount, Move } from './moves.ts'

const FACE_MOVES = ['U', 'D', 'R', 'L', 'F', 'B'] as const
const AXIS: Record<(typeof FACE_MOVES)[number], number> = { U: 0, D: 0, R: 1, L: 1, F: 2, B: 2 }

/**
 * Random-move scramble using only outer face turns. Never turns the same
 * face twice in a row, and never makes three turns on one axis in a row
 * (R L R), since those collapse into fewer moves.
 *
 * `random` is injectable so tests can use a seeded generator.
 */
export const randomScramble = (length = 20, random: () => number = Math.random): Move[] => {
  const moves: Move[] = []
  while (moves.length < length) {
    const base = FACE_MOVES[Math.floor(random() * FACE_MOVES.length)]
    const prev = moves.at(-1)
    const prev2 = moves.at(-2)
    if (prev && prev.base === base) continue
    if (prev && prev2 && AXIS[prev.base as keyof typeof AXIS] === AXIS[base] && AXIS[prev2.base as keyof typeof AXIS] === AXIS[base]) continue
    moves.push({ base, amount: (1 + Math.floor(random() * 3)) as Amount })
  }
  return moves
}
