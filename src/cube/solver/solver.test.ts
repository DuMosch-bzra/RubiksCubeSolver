import { describe, expect, it } from 'vitest'
import { isF2LSolved } from '../cases/caseTable.ts'
import { applyMove, applyMoves } from '../moves.ts'
import { formatAlgorithm, parseAlgorithm } from '../notation.ts'
import { randomScramble, seededRandom } from '../scramble.ts'
import { SOLVED, facelet, type CubeState } from '../state.ts'
import { CROSS_STATE_COUNT, crossTableSize, isCrossSolved, solveCross } from './cross.ts'
import { UnsolvableCubeError } from './errors.ts'
import { SLOTS, isSlotSolved, pairStateCount, slotInserts, solveF2L } from './f2l.ts'
import { solve } from './solve.ts'

const run = (alg: string, from: CubeState = SOLVED) => applyMoves(from, parseAlgorithm(alg))
const scrambles = (n: number, seed = 1) => {
  const rng = seededRandom(seed)
  return Array.from({ length: n }, () => applyMoves(SOLVED, randomScramble(25, rng)))
}
const swap = (s: CubeState, i: number, j: number) => {
  const a = [...s]
  ;[a[i], a[j]] = [a[j], a[i]]
  return a.join('')
}

describe('cross', () => {
  it('reaches every one of the 190,080 cross states', () => {
    expect(crossTableSize()).toBe(CROSS_STATE_COUNT)
  })

  it('is already solved on a solved cube or after U moves', () => {
    expect(solveCross(SOLVED)).toEqual([])
    expect(solveCross(run('U2 R U R\' U\''))).toEqual([])
  })

  it.each(["R", "F2", "D'", "L B"])('undoes "%s" optimally', (alg) => {
    const moves = solveCross(run(alg))
    expect(moves).toHaveLength(parseAlgorithm(alg).length)
    expect(isCrossSolved(run(formatAlgorithm(moves), run(alg)))).toBe(true)
  })

  it('solves random crosses in at most 8 moves', () => {
    for (const s of scrambles(200)) {
      const moves = solveCross(s)
      expect(moves.length).toBeLessThanOrEqual(8)
      expect(isCrossSolved(applyMoves(s, moves))).toBe(true)
    }
  })
})

describe('F2L', () => {
  it.each(SLOTS)('%s inserts only touch their own slot and the U layer', (slot) => {
    for (const ins of slotInserts(slot)) {
      const s = run(ins)
      expect(isCrossSolved(s)).toBe(true)
      for (const other of SLOTS) if (other !== slot) expect(isSlotSolved(s, other)).toBe(true)
      expect(isSlotSolved(s, slot)).toBe(false)
    }
  })

  it.each(SLOTS)('%s pair: every position in the U layer or own slot is solvable (150)', (slot) => {
    expect(pairStateCount(slot)).toBe(5 * 3 * 5 * 2)
  })

  it.each(SLOTS)('%s pair: with all slots free, every position is solvable (384)', (slot) => {
    expect(pairStateCount(slot, SLOTS.filter((s) => s !== slot))).toBe(8 * 3 * 8 * 2)
  })

  it('solves F2L after the cross and keeps the cross', () => {
    for (const s of scrambles(100, 2)) {
      let state = applyMoves(s, solveCross(s))
      for (const { slot, moves } of solveF2L(state)) {
        state = applyMoves(state, moves)
        expect(isSlotSolved(state, slot)).toBe(true)
        expect(isCrossSolved(state)).toBe(true)
      }
      expect(isF2LSolved(state)).toBe(true)
    }
  })
})

describe('solve', () => {
  it('returns no moves for a solved cube', () => {
    const { moves, steps } = solve(SOLVED)
    expect(moves).toEqual([])
    expect(steps.filter((s) => s.stage === 'oll' || s.stage === 'pll').every((s) => s.caseName === 'skip')).toBe(true)
  })

  it.each(['full', 'two-look'] as const)('solves 300 random scrambles (%s PLL)', (pll) => {
    for (const s of scrambles(300, pll === 'full' ? 3 : 4)) {
      const { steps, moves } = solve(s, { pll })
      expect(applyMoves(s, moves)).toBe(SOLVED)
      let state = s
      for (const step of steps) {
        state = applyMoves(state, step.moves)
        if (step.stage === 'cross') expect(isCrossSolved(state)).toBe(true)
      }
      expect(state).toBe(SOLVED)
    }
  })

  it('handles a cube held in another orientation', () => {
    const s = applyMove(scrambles(1, 5)[0], { base: 'x', amount: 1 })
    const { steps, moves } = solve(s)
    expect(steps[0].stage).toBe('orientation')
    expect(applyMoves(s, moves)).toBe(SOLVED)
  })

  it('rejects a flipped edge', () => {
    expect(() => solve(swap(SOLVED, facelet('U', 7), facelet('F', 1)))).toThrow(UnsolvableCubeError)
  })

  it('rejects a twisted corner', () => {
    const [a, b, c] = [facelet('U', 8), facelet('F', 2), facelet('R', 0)]
    const twisted = [...SOLVED]
    ;[twisted[a], twisted[b], twisted[c]] = [SOLVED[b], SOLVED[c], SOLVED[a]]
    expect(() => solve(twisted.join(''))).toThrow(UnsolvableCubeError)
  })

  it('rejects two swapped edges (UF <-> UR) with a clear last-layer error', () => {
    const s = swap(swap(SOLVED, facelet('U', 7), facelet('U', 5)), facelet('F', 1), facelet('R', 1))
    expect(() => solve(s)).toThrow(/PLL.*no matching case/)
  })

  it('rejects a cube with a missing piece', () => {
    expect(() => solve(swap(SOLVED, facelet('D', 1), facelet('U', 4)))).toThrow()
  })
})
