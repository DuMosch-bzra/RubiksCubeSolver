import { describe, expect, it } from 'vitest'
import { applyMoves, rotateAlgorithm, type Move } from '../moves.ts'
import { formatAlgorithm, formatMove, parseAlgorithm } from '../notation.ts'
import { randomScramble, seededRandom } from '../scramble.ts'
import { SOLVED, faceStickers, facelet, type CubeState } from '../state.ts'
import {
  BEGINNER_ALGORITHMS, beginnerTableSizes, isFirstLayerCornerSolved, isMiddleEdgeSolved, solveBeginner,
} from './beginner.ts'
import { isCrossSolved } from './cross.ts'
import { UnsolvableCubeError } from './errors.ts'
import { solve } from './methods.ts'

const SLOTS = ['FR', 'FL', 'BR', 'BL'] as const
const scrambles = (n: number, seed: number) => {
  const rng = seededRandom(seed)
  return Array.from({ length: n }, () => applyMoves(SOLVED, randomScramble(25, rng)))
}
const topEdgesDone = (s: CubeState) =>
  [1, 3, 5, 7].every((i) => s[facelet('U', i)] === 'U') &&
  (['F', 'R', 'B', 'L'] as const).every((f) => s[facelet(f, 1)] === f)

describe('rotateAlgorithm', () => {
  it('relabels moves for a turned cube', () => {
    expect(formatAlgorithm(rotateAlgorithm(parseAlgorithm("R U R' U'"), parseAlgorithm('y')))).toBe("B U B' U'")
    expect(formatAlgorithm(rotateAlgorithm(parseAlgorithm("R U R'"), parseAlgorithm('y2')))).toBe("L U L'")
  })

  it('does the same as rotate + algorithm + rotate back', () => {
    const alg = parseAlgorithm("R U2 F' D L2 B")
    for (const r of ['y', "y'", 'x', 'z2']) {
      const rot = parseAlgorithm(r)
      const withRotation = applyMoves(SOLVED, [...rot, ...alg, ...parseAlgorithm(`${r}'`.replace("''", ''))])
      expect(applyMoves(SOLVED, rotateAlgorithm(alg, rot))).toBe(withRotation)
    }
  })
})

describe('beginner method', () => {
  it('can solve every position of each tracked piece', () => {
    expect(beginnerTableSizes()).toEqual({
      cornerFR: 5 * 3, // 4 top corners + its own slot, 3 twists each
      cornerFRAllFree: 8 * 3,
      edgeFR: 5 * 2,
      edgeFRAllFree: 8 * 2,
      topCross: 8, // edge-orientation patterns with an even number of flips
      topEdges: 24, // 4! arrangements of the top edges
      topCorners: 12, // even corner arrangements
    })
  })

  it('solves 300 random scrambles and every step does its job', () => {
    for (const s of scrambles(300, 11)) {
      const { steps, moves } = solveBeginner(s)
      expect(applyMoves(s, moves)).toBe(SOLVED)
      let state = s
      for (const step of steps) {
        state = applyMoves(state, step.moves)
        if (step.stage === 'cross') expect(isCrossSolved(state)).toBe(true)
        if (step.stage === 'first-layer') {
          const slot = step.label.split(' ')[2] as (typeof SLOTS)[number]
          expect(isFirstLayerCornerSolved(state, slot)).toBe(true)
          expect(isCrossSolved(state)).toBe(true)
        }
        if (step.stage === 'second-layer') {
          const slot = step.label.split(' ')[2] as (typeof SLOTS)[number]
          expect(isMiddleEdgeSolved(state, slot)).toBe(true)
          expect(SLOTS.every((c) => isFirstLayerCornerSolved(state, c))).toBe(true)
        }
        if (step.label === 'Top cross') expect([1, 3, 5, 7].every((i) => state[facelet('U', i)] === 'U')).toBe(true)
        if (step.label === 'Top edges') expect(topEdgesDone(state)).toBe(true)
      }
      expect(state).toBe(SOLVED)
    }
  })

  it('builds every step only from U turns and that step’s taught algorithm', () => {
    // Drop all U turns, then the rest must be whole copies of the algorithm (any of its 4 angles).
    const withoutU = (moves: Move[]) => moves.filter((m) => m.base !== 'U').map(formatMove)
    const angles = (alg: string) =>
      ['', 'y', 'y2', "y'"].map((r) => withoutU(rotateAlgorithm(parseAlgorithm(alg), parseAlgorithm(r))))
    const composedOf = (moves: Move[], pieces: string[][]): boolean => {
      const rest = withoutU(moves)
      const match = (i: number): boolean =>
        i === rest.length || pieces.some((p) => p.length > 0 && p.every((m, k) => rest[i + k] === m) && match(i + p.length))
      return match(0)
    }
    const allowed: Record<string, string[][]> = {
      'first-layer': angles(BEGINNER_ALGORITHMS.corner),
      'second-layer': [...angles(BEGINNER_ALGORITHMS.insertRight), ...angles(BEGINNER_ALGORITHMS.insertLeft)],
      'Top cross': angles(BEGINNER_ALGORITHMS.topCross).slice(0, 1),
      'Top edges': angles(BEGINNER_ALGORITHMS.topEdges).slice(0, 1),
      'Position top corners': angles(BEGINNER_ALGORITHMS.topCornerPositions),
      'Orient top corners': angles(BEGINNER_ALGORITHMS.topCornerOrientation).slice(0, 1),
    }
    for (const s of scrambles(100, 12)) {
      for (const step of solveBeginner(s).steps) {
        const pieces = allowed[step.stage] ?? allowed[step.label]
        if (!pieces) continue
        expect(composedOf(step.moves, pieces), `${step.label}: ${formatAlgorithm(step.moves)}`).toBe(true)
      }
    }
  })

  it('is selectable through the method registry', () => {
    const s = scrambles(1, 13)[0]
    const solution = solve(s, { method: 'beginner', cfop: { oll: 'full', pll: 'full' } })
    expect(applyMoves(s, solution.moves)).toBe(SOLVED)
    expect(solution.steps.some((st) => st.label === 'Orient top corners')).toBe(true)
  })

  it('returns no moves for a solved cube', () => {
    expect(solveBeginner(SOLVED).moves).toEqual([])
    expect(faceStickers(SOLVED, 'U')).toBe('UUUUUUUUU')
  })

  it('rejects a twisted corner', () => {
    const [a, b, c] = [facelet('U', 8), facelet('F', 2), facelet('R', 0)]
    const t = [...SOLVED]
    ;[t[a], t[b], t[c]] = [SOLVED[b], SOLVED[c], SOLVED[a]]
    expect(() => solveBeginner(t.join(''))).toThrow(UnsolvableCubeError)
  })
})
