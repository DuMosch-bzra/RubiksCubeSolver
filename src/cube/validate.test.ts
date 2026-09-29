import { describe, expect, it } from 'vitest'
import { applyMoves } from './moves.ts'
import { parseAlgorithm } from './notation.ts'
import { randomScramble, seededRandom } from './scramble.ts'
import { SOLVED, facelet, type CubeState } from './state.ts'
import { UNPAINTED, validateCube } from './validate.ts'

const run = (alg: string, from: CubeState = SOLVED) => applyMoves(from, parseAlgorithm(alg))
const set = (s: CubeState, changes: Record<number, string>) =>
  [...s].map((c, i) => changes[i] ?? c).join('')
const swap = (s: CubeState, pairs: [number, number][]) =>
  set(s, Object.fromEntries(pairs.flatMap(([a, b]) => [[a, s[b]], [b, s[a]]])))
const kinds = (s: CubeState) => validateCube(s).map((i) => i.kind)

describe('validateCube', () => {
  it('accepts the solved cube and 300 random scrambles', () => {
    expect(validateCube(SOLVED)).toEqual([])
    const rng = seededRandom(7)
    for (let i = 0; i < 300; i++) expect(validateCube(applyMoves(SOLVED, randomScramble(25, rng)))).toEqual([])
  })

  it('detects a flipped edge', () => {
    expect(kinds(swap(run("R U F'"), [[facelet('U', 7), facelet('F', 1)]]))).toEqual(['flip'])
  })

  it('detects a twisted corner', () => {
    const [a, b, c] = [facelet('U', 8), facelet('F', 2), facelet('R', 0)]
    const s = run("L D2 B'")
    expect(kinds(set(s, { [a]: s[b], [b]: s[c], [c]: s[a] }))).toEqual(['twist'])
  })

  it('detects two swapped edges', () => {
    const s = swap(SOLVED, [[facelet('U', 7), facelet('U', 5)], [facelet('F', 1), facelet('R', 1)]])
    expect(kinds(s)).toEqual(['parity'])
  })

  it('detects two swapped corners', () => {
    // T-perm swaps two corners and two edges; swapping the edges back leaves only the corners.
    const t = run("R U R' U' R' F R2 U' R' U' R U R' F'")
    const s = swap(t, [[facelet('U', 3), facelet('U', 5)], [facelet('L', 1), facelet('R', 1)]])
    expect(kinds(s)).toEqual(['parity'])
  })

  it('detects a mirrored corner (two of its stickers swapped)', () => {
    const s = swap(SOLVED, [[facelet('F', 2), facelet('R', 0)]])
    expect(kinds(s)).toContain('impossible-piece')
    expect(validateCube(s)[0].message).toMatch(/mirrored/)
  })

  it('detects opposite colours on one edge', () => {
    const issues = validateCube(set(SOLVED, { [facelet('F', 1)]: 'D' }))
    expect(issues).toContainEqual({ kind: 'impossible-piece', message: 'An edge shows U-D, no real edge has that combination' })
    expect(issues).toContainEqual({ kind: 'missing-piece', message: 'The U-F edge is missing' })
  })

  it('detects a duplicated corner (painted in a real orientation) and names the missing one', () => {
    const s = set(SOLVED, { [facelet('U', 8)]: 'U', [facelet('F', 2)]: 'R', [facelet('R', 0)]: 'B' })
    const issues = validateCube(s)
    expect(issues).toContainEqual({ kind: 'duplicate-piece', message: 'The U-R-B corner appears 2 times' })
    expect(issues).toContainEqual({ kind: 'missing-piece', message: 'The U-F-R corner is missing' })
  })

  it('names a mirrored corner in its real order', () => {
    const s = set(SOLVED, { [facelet('U', 8)]: 'F', [facelet('F', 2)]: 'L', [facelet('R', 0)]: 'U' })
    expect(validateCube(s)).toContainEqual({ kind: 'impossible-piece', message: 'The U-L-F corner is mirrored, two of its stickers are swapped' })
  })

  it('reports unpainted stickers without complaining about low counts', () => {
    const s = set(SOLVED, { [facelet('U', 0)]: UNPAINTED, [facelet('F', 0)]: UNPAINTED })
    expect(validateCube(s)).toEqual([{ kind: 'unpainted', message: '2 stickers not painted yet' }])
  })

  it('reports too many of a colour', () => {
    expect(validateCube(set(SOLVED, { [facelet('F', 0)]: 'U' }))[0]).toMatchObject({ kind: 'count', message: 'Too many U stickers (10 of 9)' })
  })

  it('uses colour names in messages', () => {
    const s = set(SOLVED, { [facelet('F', 0)]: 'U' })
    expect(validateCube(s, (f) => ({ U: 'white' })[f as 'U'] ?? f)[0].message).toBe('Too many white stickers (10 of 9)')
  })

  it('requires centres in the standard position', () => {
    expect(kinds(run('x'))).toEqual(['centres'])
  })
})
