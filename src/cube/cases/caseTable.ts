import { applyMoves, type Move } from '../moves.ts'
import { formatAlgorithm, invertAlgorithm, parseAlgorithm } from '../notation.ts'
import { withOrientationRestored } from '../rotation.ts'
import { SOLVED, facelet, type CubeState, type Face } from '../state.ts'

/** One entry of an algorithm list: a case name and the algorithm that solves it. */
export interface AlgorithmDef {
  name: string
  alg: string
}

// ---------------------------------------------------------------------------
// Sticker groups
// ---------------------------------------------------------------------------

const SIDES: Face[] = ['F', 'R', 'B', 'L']

/** The 21 last-layer stickers: the U face plus the top row of each side. */
export const LL_STICKERS: readonly number[] = [
  ...Array.from({ length: 9 }, (_, i) => facelet('U', i)),
  ...SIDES.flatMap((f) => [0, 1, 2].map((i) => facelet(f, i))),
]

const LL_SET = new Set(LL_STICKERS)

/** Everything that is not last layer: the D face and the middle layer (plus centres). */
export const F2L_STICKERS: readonly number[] = [...SOLVED].map((_, i) => i).filter((i) => !LL_SET.has(i))

export const isF2LSolved = (state: CubeState): boolean => F2L_STICKERS.every((i) => state[i] === SOLVED[i])

// ---------------------------------------------------------------------------
// Case keys: which features of the last layer a table looks at
// ---------------------------------------------------------------------------

/** Projects a cube state onto the features a step cares about. */
export type CaseKey = (state: CubeState) => string

const pick = (state: CubeState, indices: readonly number[]) => indices.map((i) => state[i]).join('')
const isTop = (state: CubeState, indices: readonly number[]) =>
  indices.map((i) => (state[i] === 'U' ? '1' : '0')).join('')

const TOP_EDGES = [1, 3, 5, 7].map((i) => facelet('U', i))
const CORNER_SIDES = SIDES.flatMap((f) => [facelet(f, 0), facelet(f, 2)])

/** OLL: which of the 21 LL stickers show the U colour. */
export const orientationKey: CaseKey = (s) => isTop(s, LL_STICKERS)

/** 2-look OLL step 1: which top edges already show the U colour. */
export const edgeOrientationKey: CaseKey = (s) => isTop(s, TOP_EDGES)

/** PLL: the colours of all LL stickers. */
export const permutationKey: CaseKey = (s) => pick(s, LL_STICKERS)

/** 2-look PLL step 1: the side colours of the four LL corners. */
export const cornerPermutationKey: CaseKey = (s) => pick(s, CORNER_SIDES)

// ---------------------------------------------------------------------------
// Table generation
// ---------------------------------------------------------------------------

/** Number of U turns before or after the algorithm (0 = none, 3 = U'). */
export type Auf = 0 | 1 | 2 | 3

export const SKIP = 'skip'

export interface CaseSolution {
  caseName: string
  /** The algorithm as written in the list, without AUFs. */
  algorithm: string
  preAuf: Auf
  postAuf: Auf
  /** Everything to execute: pre-AUF, algorithm, post-AUF. */
  moves: Move[]
}

export interface CaseConflict {
  key: string
  caseNames: [string, string]
}

export interface CaseTable {
  name: string
  key: CaseKey
  /** Number of distinct keys (a case counted once per AUF variant). */
  size: number
  /** Every case name that ended up in the table, including 'skip'. */
  caseNames: string[]
  /** Pairs of differently named algorithms that solve the same case. Should be empty. */
  conflicts: CaseConflict[]
  lookup: (state: CubeState) => CaseSolution | undefined
}

export interface CaseTableOptions {
  name: string
  algorithms: readonly AlgorithmDef[]
  key: CaseKey
  /** Try U turns before the algorithm (the case can appear rotated). */
  preAuf?: boolean
  /** Try U turns after the algorithm (the layer can end up rotated). */
  postAuf?: boolean
}

const aufMoves = (n: Auf): Move[] => (n === 0 ? [] : [{ base: 'U', amount: n }])

/**
 * Builds a case table from a list of algorithms.
 *
 * For each algorithm A and each AUF pair (u, v), the state the sequence
 * U^u A U^v solves is `SOLVED` with the inverse applied. Projecting that
 * state through `key` gives the pattern to recognise. So the table only
 * needs the algorithms and never hand-written case diagrams.
 *
 * Throws if an algorithm doesn't parse or disturbs the first two layers,
 * which is almost always a typo in the list.
 */
export const buildCaseTable = ({ name, algorithms, key, preAuf = false, postAuf = false }: CaseTableOptions): CaseTable => {
  const entries = new Map<string, CaseSolution>()
  const conflicts: CaseConflict[] = []
  const pres: Auf[] = preAuf ? [0, 1, 2, 3] : [0]
  const posts: Auf[] = postAuf ? [0, 1, 2, 3] : [0]

  for (const def of [{ name: SKIP, alg: '' }, ...algorithms]) {
    let body: Move[]
    try {
      body = withOrientationRestored(parseAlgorithm(def.alg))
    } catch (e) {
      throw new Error(`${name} / ${def.name}: ${(e as Error).message}`, { cause: e })
    }
    if (!isF2LSolved(applyMoves(SOLVED, body))) {
      throw new Error(`${name} / ${def.name}: "${def.alg}" does not preserve the first two layers`)
    }

    for (const pre of pres) {
      for (const post of posts) {
        const moves = [...aufMoves(pre), ...body, ...aufMoves(post)]
        const k = key(applyMoves(SOLVED, invertAlgorithm(moves)))
        const existing = entries.get(k)
        if (existing && existing.caseName !== def.name) {
          if (!conflicts.some((c) => c.key === k)) conflicts.push({ key: k, caseNames: [existing.caseName, def.name] })
          continue
        }
        if (existing && existing.moves.length <= moves.length) continue
        entries.set(k, { caseName: def.name, algorithm: formatAlgorithm(body), preAuf: pre, postAuf: post, moves })
      }
    }
  }

  return {
    name,
    key,
    size: entries.size,
    caseNames: [...new Set([...entries.values()].map((e) => e.caseName))],
    conflicts,
    lookup: (state) => entries.get(key(state)),
  }
}
