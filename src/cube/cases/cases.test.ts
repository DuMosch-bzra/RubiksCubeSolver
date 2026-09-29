import { beforeAll, describe, expect, it } from 'vitest'
import { applyMoves } from '../moves.ts'
import { formatAlgorithm, parseAlgorithm } from '../notation.ts'
import { withOrientationRestored } from '../rotation.ts'
import { SOLVED, faceStickers, type CubeState } from '../state.ts'
import {
  SKIP, buildCaseTable, edgeOrientationKey, isF2LSolved, orientationKey, permutationKey, type CaseTable,
} from './caseTable.ts'
import { OLL_CORNERS_2LOOK, OLL_EDGES_2LOOK, PLL_CORNERS_2LOOK, PLL_EDGES_2LOOK, PLL_FULL } from './tables.ts'

const run = (alg: string, from: CubeState = SOLVED) => applyMoves(from, parseAlgorithm(alg))

/** Compiles an algorithm to a sticker permutation so the BFS below stays fast. */
const compile = (alg: string) => {
  const ids = Array.from({ length: 54 }, (_, i) => String.fromCharCode(0x100 + i)).join('')
  const perm = [...run(alg, ids)].map((c) => c.charCodeAt(0) - 0x100)
  return (s: string) => perm.map((i) => s[i]).join('')
}

/**
 * Every reachable last-layer state with F2L solved: the orbit of SOLVED
 * under U, Sune, T-perm and an edge-flip algorithm. These generators are
 * written here on purpose, independent of the algorithm lists being tested.
 */
const LL_GROUP_SIZE = (24 * 24 / 2) * 27 * 8 // 62,208
let allLastLayers: CubeState[] = []

beforeAll(() => {
  const gens = ['U', "R U R' U R U2 R'", "R U R' U' R' F R2 U' R' U' R U R' F'", "F R U R' U' F'"].map(compile)
  const seen = new Set([SOLVED])
  const queue = [SOLVED]
  for (let i = 0; i < queue.length; i++) {
    for (const g of gens) {
      const next = g(queue[i])
      if (!seen.has(next)) {
        seen.add(next)
        queue.push(next)
      }
    }
  }
  allLastLayers = queue
})

/** One representative state per distinct key. */
const representatives = (states: CubeState[], key: (s: CubeState) => string) =>
  [...new Map(states.map((s) => [key(s), s])).values()]

const solveWith = (state: CubeState, table: CaseTable): CubeState => {
  const hit = table.lookup(state)
  if (!hit) throw new Error(`${table.name}: no case for ${table.key(state)}`)
  return applyMoves(state, hit.moves)
}

const topSolved = (s: CubeState) => faceStickers(s, 'U') === 'UUUUUUUUU'

describe('last-layer state space', () => {
  it('has every one of the 62,208 states', () => {
    expect(allLastLayers).toHaveLength(LL_GROUP_SIZE)
    expect(allLastLayers.every(isF2LSolved)).toBe(true)
  })
})

describe.each([
  [OLL_EDGES_2LOOK, 4],
  [OLL_CORNERS_2LOOK, 8],
  [PLL_CORNERS_2LOOK, 3],
  [PLL_EDGES_2LOOK, 5],
  [PLL_FULL, 22],
])('$name', (table, caseCount) => {
  it('uses every algorithm (plus skip) and has no duplicate cases', () => {
    expect(table.conflicts).toEqual([])
    expect(table.caseNames).toHaveLength(caseCount)
  })

  it('recognises a solved cube as skip', () => {
    expect(table.lookup(SOLVED)).toMatchObject({ caseName: SKIP, moves: [] })
  })
})

describe('coverage', () => {
  it('2-look OLL orients all 216 orientation cases', () => {
    const cases = representatives(allLastLayers, orientationKey)
    expect(cases).toHaveLength(216)
    for (const state of cases) {
      const afterEdges = solveWith(state, OLL_EDGES_2LOOK)
      expect(edgeOrientationKey(afterEdges)).toBe('1111')
      const done = solveWith(afterEdges, OLL_CORNERS_2LOOK)
      expect(topSolved(done)).toBe(true)
      expect(isF2LSolved(done)).toBe(true)
    }
  })

  it('full PLL solves all 288 oriented last layers', () => {
    const cases = allLastLayers.filter(topSolved)
    expect(cases).toHaveLength(288)
    for (const state of cases) expect(solveWith(state, PLL_FULL)).toBe(SOLVED)
  })

  it('2-look PLL solves all 288 oriented last layers', () => {
    for (const state of allLastLayers.filter(topSolved)) {
      expect(solveWith(solveWith(state, PLL_CORNERS_2LOOK), PLL_EDGES_2LOOK)).toBe(SOLVED)
    }
  })

  it('full PLL recognises all 288 states as distinct keys', () => {
    expect(PLL_FULL.size).toBe(288)
  })
})

describe('recognition', () => {
  it('finds the T-perm with no AUF', () => {
    const tperm = "R U R' U' R' F R2 U' R' U' R U R' F'"
    expect(PLL_FULL.lookup(run(tperm))).toMatchObject({ caseName: 'T', preAuf: 0, postAuf: 0 })
  })

  it('finds a rotated case and adds the AUFs', () => {
    const state = run("U' M2 U M U2 M' U M2 U2") // Ua, seen from a different side
    const hit = PLL_FULL.lookup(state)
    expect(hit?.caseName).toMatch(/^U[ab]$/)
    expect(applyMoves(state, hit!.moves)).toBe(SOLVED)
  })

  it('names the Sune case', () => {
    const state = run("R U2 R' U' R U' R'") // inverse of Sune
    expect(OLL_CORNERS_2LOOK.lookup(state)?.caseName).toBe('Sune')
  })

  it('ignores stickers outside the key', () => {
    expect(permutationKey(run('D'))).toBe(permutationKey(SOLVED))
  })
})

describe('buildCaseTable', () => {
  it('rejects an algorithm that breaks F2L', () => {
    expect(() => buildCaseTable({ name: 't', algorithms: [{ name: 'bad', alg: 'R' }], key: orientationKey }))
      .toThrow(/bad.*does not preserve/)
  })

  it('rejects an unparsable algorithm', () => {
    expect(() => buildCaseTable({ name: 't', algorithms: [{ name: 'typo', alg: 'R Q' }], key: orientationKey }))
      .toThrow(/typo.*Unknown move "Q"/)
  })

  it('reports two algorithms for the same case', () => {
    const table = buildCaseTable({
      name: 't',
      key: orientationKey,
      preAuf: true,
      algorithms: [
        { name: 'Sune', alg: "R U R' U R U2 R'" },
        { name: 'Sune from the side', alg: "y R U R' U R U2 R' y'" },
      ],
    })
    expect(table.conflicts.map((c) => c.caseNames)).toContainEqual(['Sune', 'Sune from the side'])
  })
})

describe('rotation fix', () => {
  it('appends the rotation that undoes a net rotation', () => {
    expect(formatAlgorithm(withOrientationRestored(parseAlgorithm("R U R' y")))).toBe("R U R' y y'")
    expect(formatAlgorithm(withOrientationRestored(parseAlgorithm("R U R'")))).toBe("R U R'")
  })
})
