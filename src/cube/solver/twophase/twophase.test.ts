import { describe, expect, it } from 'vitest'
import { applyMoves } from '../../moves.ts'
import { randomScramble, seededRandom } from '../../scramble.ts'
import { SOLVED } from '../../state.ts'
import {
  MOVE_CUBES, N_FLIP, N_PERM8, N_SLICE, N_TWIST, SEARCH_MOVES, SOLVED_CUBIE, SOLVED_SLICE, getFlip, getSlice,
  getTwist, multiply, permRank, permUnrank, setFlip, setSlice, setTwist, toCubie,
} from './cubie.ts'

describe('cubie model', () => {
  it('reads the solved cube as the identity', () => {
    expect(SOLVED_CUBIE).toEqual({
      cp: [0, 1, 2, 3, 4, 5, 6, 7], co: new Array(8).fill(0),
      ep: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], eo: new Array(12).fill(0),
    })
    expect(SOLVED_SLICE).toBe(494)
  })

  it('multiplying piece cubes matches turning the sticker cube', () => {
    const rng = seededRandom(3)
    for (let n = 0; n < 200; n++) {
      const moves = randomScramble(15, rng)
      let c = SOLVED_CUBIE
      for (const m of moves) c = multiply(c, MOVE_CUBES[SEARCH_MOVES.findIndex((s) => s.base === m.base && s.amount === m.amount)])
      expect(c).toEqual(toCubie(applyMoves(SOLVED, moves)))
    }
  })

  it('only F and B quarter turns flip edges; U and D never twist corners', () => {
    SEARCH_MOVES.forEach((m, i) => {
      const flips = MOVE_CUBES[i].eo.some((o) => o)
      expect(flips).toBe((m.base === 'F' || m.base === 'B') && m.amount !== 2)
      if (m.base === 'U' || m.base === 'D' || m.amount === 2) expect(MOVE_CUBES[i].co.every((o) => o === 0)).toBe(true)
    })
  })
})

describe('coordinates', () => {
  it('twist, flip and slice round-trip for every value', () => {
    for (let t = 0; t < N_TWIST; t++) expect(getTwist({ ...SOLVED_CUBIE, co: setTwist(t) })).toBe(t)
    for (let f = 0; f < N_FLIP; f++) expect(getFlip({ ...SOLVED_CUBIE, eo: setFlip(f) })).toBe(f)
    for (let s = 0; s < N_SLICE; s++) expect(getSlice({ ...SOLVED_CUBIE, ep: setSlice(s) })).toBe(s)
  })

  it('permutation rank round-trips', () => {
    for (let r = 0; r < N_PERM8; r += 97) expect(permRank(permUnrank(r, 8))).toBe(r)
    expect(permRank([0, 1, 2, 3])).toBe(0)
    expect(permRank([3, 2, 1, 0])).toBe(23)
  })
})

describe('tables', () => {
  it('builds all tables and every pruning entry is reachable', async () => {
    const { buildTables, N_P2 } = await import('./tables.ts')
    const t0 = performance.now()
    const t = buildTables()
    const seconds = (performance.now() - t0) / 1000
    console.log(`two-phase tables built in ${seconds.toFixed(2)} s`)
    expect(N_P2).toBe(10)
    for (const [name, table, max] of [
      ['twist x slice', t.twistSlicePrune, 9],
      ['flip x slice', t.flipSlicePrune, 9],
      ['corners x slice order', t.cornerSlicePrune, 18],
      ['edges x slice order', t.edgeSlicePrune, 18],
    ] as const) {
      const depths = new Map<number, number>()
      for (const d of table) depths.set(d, (depths.get(d) ?? 0) + 1)
      expect(depths.has(-1), `${name} has unreachable entries`).toBe(false)
      expect(Math.max(...depths.keys())).toBeLessThanOrEqual(max)
      console.log(name, 'max depth', Math.max(...depths.keys()), 'entries', table.length)
    }
  }, 120_000)
})

describe('two-phase search', () => {
  it('solves 40 random scrambles in few moves, phase 1 ends in the subgroup', async () => {
    const { solveTwoPhase } = await import('./index.ts')
    const { getTables } = await import('./tables.ts')
    getTables()
    const rng = seededRandom(21)
    const lengths: number[] = []
    let worstMs = 0
    for (let n = 0; n < 40; n++) {
      const s = applyMoves(SOLVED, randomScramble(30, rng))
      const t0 = performance.now()
      const { steps, moves } = solveTwoPhase(s, { targetLength: 20, timeLimitMs: 1000 })
      worstMs = Math.max(worstMs, performance.now() - t0)
      expect(applyMoves(s, moves)).toBe(SOLVED)
      const afterPhase1 = toCubie(applyMoves(s, steps.find((st) => st.stage === 'phase-1')!.moves))
      expect(getTwist(afterPhase1)).toBe(0)
      expect(getFlip(afterPhase1)).toBe(0)
      expect(getSlice(afterPhase1)).toBe(SOLVED_SLICE)
      const phase2 = steps.find((st) => st.stage === 'phase-2')!.moves
      expect(phase2.every((m) => m.base === 'U' || m.base === 'D' || m.amount === 2)).toBe(true)
      lengths.push(moves.length)
    }
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length
    console.log(`two-phase: average ${avg.toFixed(1)} moves, max ${Math.max(...lengths)}, slowest ${worstMs.toFixed(0)} ms`)
    expect(Math.max(...lengths)).toBeLessThanOrEqual(22)
  }, 120_000)

  it('returns nothing for a solved cube and rejects impossible cubes', async () => {
    const { solveTwoPhase } = await import('./index.ts')
    const { UnsolvableCubeError } = await import('../errors.ts')
    expect(solveTwoPhase(SOLVED).moves).toEqual([])
    const flipped = [...SOLVED]
    ;[flipped[7], flipped[19]] = [flipped[19], flipped[7]] // U7 <-> F1
    expect(() => solveTwoPhase(flipped.join(''))).toThrow(UnsolvableCubeError)
  })

  it('handles a cube held in another orientation', async () => {
    const { solveTwoPhase } = await import('./index.ts')
    const s = applyMoves(applyMoves(SOLVED, randomScramble(20, seededRandom(4))), [{ base: 'x', amount: 1 }])
    const { steps, moves } = solveTwoPhase(s)
    expect(steps[0].stage).toBe('orientation')
    expect(applyMoves(s, moves)).toBe(SOLVED)
  })
})
