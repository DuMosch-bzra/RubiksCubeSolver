import { describe, expect, it } from 'vitest'
import {
  BASE_MOVES, NotationError, SOLVED, applyMove, applyMoves, faceStickers, formatAlgorithm,
  invertAlgorithm, isSolved, parseAlgorithm, randomScramble, type Amount, type CubeState,
} from './index.ts'

const run = (alg: string, from: CubeState = SOLVED) => applyMoves(from, parseAlgorithm(alg))

/** Deterministic PRNG (mulberry32) for reproducible scrambles. */
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const colourCounts = (s: CubeState) =>
  [...s].reduce<Record<string, number>>((acc, c) => ({ ...acc, [c]: (acc[c] ?? 0) + 1 }), {})

describe('state', () => {
  it('solved cube is solved and has 9 of each colour', () => {
    expect(SOLVED).toHaveLength(54)
    expect(isSolved(SOLVED)).toBe(true)
    expect(Object.values(colourCounts(SOLVED))).toEqual([9, 9, 9, 9, 9, 9])
  })
})

describe('moves', () => {
  it.each(BASE_MOVES)('%s has order 4 and X X\' is identity', (base) => {
    let s = SOLVED
    for (let i = 0; i < 4; i++) s = applyMove(s, { base, amount: 1 })
    expect(s).toBe(SOLVED)
    const scrambled = run("R U F' L2 D B")
    for (const amount of [1, 2, 3] as Amount[]) {
      const there = applyMove(scrambled, { base, amount })
      expect(applyMove(there, { base, amount: (4 - amount) as Amount })).toBe(scrambled)
    }
  })

  it('R moves the F column onto U', () => {
    const s = run('R')
    expect(faceStickers(s, 'U')).toBe('UUFUUFUUF')
    expect(faceStickers(s, 'F')).toBe('FFDFFDFFD')
    expect(faceStickers(s, 'R')).toBe('RRRRRRRRR')
  })

  it('U moves the R top row onto F', () => {
    expect(faceStickers(run('U'), 'F')).toBe('RRRFFFFFF')
  })

  it('F moves the L column onto the bottom row of U', () => {
    expect(faceStickers(run('F'), 'U')).toBe('UUUUUULLL')
  })

  it('R2 L2 U2 D2 F2 B2 gives a checkerboard', () => {
    const s = run('R2 L2 U2 D2 F2 B2')
    expect(faceStickers(s, 'U')).toBe('UDUDUDUDU')
    expect(faceStickers(s, 'F')).toBe('FBFBFBFBF')
  })

  it.each([
    ["R U R' U'", 6],
    ["R U R' U R U2 R'", 6], // Sune
    ["R U R' U' R' F R2 U' R' U' R U R' F'", 2], // T-perm
  ])('%s has order %i', (alg, order) => {
    let s = SOLVED
    for (let i = 1; i <= order; i++) {
      s = run(alg, s)
      expect(isSolved(s)).toBe(i === order)
    }
  })

  it.each([
    ['r', "R M'"],
    ['l', 'L M'],
    ['u', "U E'"],
    ['d', 'D E'],
    ['f', 'F S'],
    ['b', "B S'"],
    ['x', "R M' L'"],
    ['y', "U E' D'"],
    ['z', "F S B'"],
  ])('%s equals %s', (a, b) => {
    const start = run("R U F' L2 D B")
    expect(run(a, start)).toBe(run(b, start))
  })

  it('whole-cube rotations keep the cube solved', () => {
    expect(isSolved(run('x y2 z\''))).toBe(true)
    expect(run('x')).not.toBe(SOLVED)
  })

  it('always keeps 9 stickers of each colour', () => {
    expect(Object.values(colourCounts(run("R U2 D' B M' x f2 S E'")))).toEqual([9, 9, 9, 9, 9, 9])
  })
})

describe('notation', () => {
  it('parses and formats round-trip', () => {
    expect(formatAlgorithm(parseAlgorithm("R U2 R' Rw f M x2 y'"))).toBe("R U2 R' r f M x2 y'")
  })

  it('accepts brackets, R2\', R3 and typographic primes', () => {
    expect(formatAlgorithm(parseAlgorithm("(R U R’) [U2] R2' R3"))).toBe("R U R' U2 R2 R'")
  })

  it('handles empty input', () => {
    expect(parseAlgorithm('   ')).toEqual([])
  })

  it.each(['Q', 'R4', "R''", 'Mw', 'RU'])('rejects "%s"', (bad) => {
    expect(() => parseAlgorithm(bad)).toThrow(NotationError)
  })

  it('algorithm followed by its inverse is identity', () => {
    const alg = parseAlgorithm("R U R' U' r' F R F' M2 y d'")
    expect(applyMoves(applyMoves(SOLVED, alg), invertAlgorithm(alg))).toBe(SOLVED)
  })
})

describe('scramble', () => {
  it('has the requested length and no redundant sequences', () => {
    const axis = (b: string) => 'UDRLFB'.indexOf(b) >> 1
    for (let seed = 0; seed < 50; seed++) {
      const moves = randomScramble(25, seeded(seed))
      expect(moves).toHaveLength(25)
      moves.forEach((m, i) => {
        if (i > 0) expect(m.base).not.toBe(moves[i - 1].base)
        if (i > 1) expect(axis(m.base) === axis(moves[i - 1].base) && axis(m.base) === axis(moves[i - 2].base)).toBe(false)
      })
    }
  })

  it('is reproducible with a seed and scrambles the cube', () => {
    expect(randomScramble(20, seeded(42))).toEqual(randomScramble(20, seeded(42)))
    expect(isSolved(applyMoves(SOLVED, randomScramble(20, seeded(42))))).toBe(false)
  })
})
