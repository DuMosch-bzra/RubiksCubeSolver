import { CORNER_CUBIES, EDGE_CUBIES, cubieAt } from '../geometry.ts'
import { applyMoves, rotateAlgorithm, type Move } from '../moves.ts'
import { parseAlgorithm, simplifyMoves } from '../notation.ts'
import { orientationFix } from '../rotation.ts'
import { SOLVED, facelet, type CubeState, type Face } from '../state.ts'
import { solveCross } from './cross.ts'
import { UnsolvableCubeError } from './errors.ts'
import { buildMacroTable, macro, walkMacroTable, type Macro, type MacroTable } from './macroSearch.ts'
import type { Solution, SolveStep } from './solve.ts'

/*
 * Beginner layer-by-layer method, as taught in most tutorials:
 *
 *   1. Cross                 (bottom)
 *   2. First-layer corners   put the corner above its spot, repeat R U R' U'
 *   3. Middle-layer edges    U R U' R' U' F' U F  /  U' F' U F U R U' R'
 *   4. Top cross             F R U R' U' F'
 *   5. Top edges             R U R' U R U2 R' U
 *   6. Position top corners  U R U' L' U R' U' L
 *   7. Orient top corners    R' D' R D, corner by corner
 *
 * Steps 2-6 each allow only that step's algorithm(s) plus U turns; a small
 * search picks the shortest way to use them, which is what a person
 * following the tutorial would do with perfect case recognition.
 */

const SLOTS = ['FR', 'FL', 'BR', 'BL'] as const
type Slot = (typeof SLOTS)[number]

const SLOT_GEOMETRY: Record<Slot, { x: number; z: number; sides: [Face, Face] }> = {
  FR: { x: 1, z: 1, sides: ['F', 'R'] },
  FL: { x: -1, z: 1, sides: ['F', 'L'] },
  BR: { x: 1, z: -1, sides: ['B', 'R'] },
  BL: { x: -1, z: -1, sides: ['B', 'L'] },
}

const cornerOf = (slot: Slot) => cubieAt([SLOT_GEOMETRY[slot].x, -1, SLOT_GEOMETRY[slot].z])
const edgeOf = (slot: Slot) => cubieAt([SLOT_GEOMETRY[slot].x, 0, SLOT_GEOMETRY[slot].z])
const home = (state: CubeState, stickers: number[]) => stickers.every((i) => state[i] === SOLVED[i])

export const isFirstLayerCornerSolved = (state: CubeState, slot: Slot) => home(state, cornerOf(slot))
export const isMiddleEdgeSolved = (state: CubeState, slot: Slot) => home(state, edgeOf(slot))

// ---------------------------------------------------------------------------
// Markings: show only the pieces a step cares about
// ---------------------------------------------------------------------------

const hasColours = (state: CubeState, stickers: number[], colours: string[]) =>
  stickers.length === colours.length && colours.every((c) => stickers.some((i) => state[i] === c))

const markPiece = (state: CubeState, cubies: readonly number[][], colours: string[]): string => {
  const piece = cubies.find((c) => hasColours(state, c, colours))
  if (!piece) throw new UnsolvableCubeError(`The ${colours.join('-')} piece is missing`)
  const marks = Array<string>(54).fill('.')
  for (const i of piece) marks[i] = state[i]
  return marks.join('')
}

const markSlotCorner = (state: CubeState, slot: Slot) => markPiece(state, CORNER_CUBIES, ['D', ...SLOT_GEOMETRY[slot].sides])
const markSlotEdge = (state: CubeState, slot: Slot) => markPiece(state, EDGE_CUBIES, [...SLOT_GEOMETRY[slot].sides])


const TOP_CORNERS = CORNER_CUBIES.filter((c) => c.some((i) => SOLVED[i] === 'U'))

/** Top cross: only where the U-coloured edge stickers are. */
const markTopCross = (state: CubeState) => {
  const marks = Array<string>(54).fill('.')
  for (const e of EDGE_CUBIES) for (const i of e) if (state[i] === 'U') marks[i] = 'U'
  return marks.join('')
}

/** Top edges: full colours of the four top-layer edges. */
const markTopEdges = (state: CubeState) => {
  const marks = Array<string>(54).fill('.')
  for (const e of EDGE_CUBIES) if (e.some((i) => state[i] === 'U')) for (const i of e) marks[i] = state[i]
  return marks.join('')
}

/** Top corner positions: each top corner as one letter on all its stickers, so twists don't show. */
const markTopCornerPositions = (state: CubeState) => {
  const marks = Array<string>(54).fill('.')
  for (const c of CORNER_CUBIES) {
    if (!c.some((i) => state[i] === 'U')) continue
    const colours = c.map((i) => state[i]).sort().join('')
    const id = TOP_CORNERS.findIndex((h) => h.map((i) => SOLVED[i]).sort().join('') === colours)
    if (id < 0) throw new UnsolvableCubeError('A top-layer corner has impossible colours')
    for (const i of c) marks[i] = String.fromCharCode(97 + id)
  }
  return marks.join('')
}

// ---------------------------------------------------------------------------
// Algorithms, and their versions for each slot (the same moves on a turned cube)
// ---------------------------------------------------------------------------

const Y_ROTATIONS = ['', 'y', 'y2', "y'"].map(parseAlgorithm)
const allAngles = (alg: string): Move[][] => Y_ROTATIONS.map((r) => rotateAlgorithm(parseAlgorithm(alg), r))

/** Assigns each rotated version of an algorithm to the slot it works on (the one it disturbs). */
const perSlot = (alg: string, disturbs: (state: CubeState, slot: Slot) => boolean): Record<Slot, Macro[]> => {
  const out = { FR: [], FL: [], BR: [], BL: [] } as Record<Slot, Macro[]>
  for (const moves of allAngles(alg)) {
    const after = applyMoves(SOLVED, moves)
    const slot = SLOTS.find((s) => disturbs(after, s))
    if (!slot) throw new Error(`"${alg}" doesn't affect any slot`)
    out[slot].push(macro(moves))
  }
  return out
}

const U_TURNS = ['U', "U'", 'U2'].map((a) => macro(a))

/** R U R' U' and its versions; lifts/drops the corner of one slot. */
const CORNER_TRIGGERS = perSlot("R U R' U'", (s, slot) => !isFirstLayerCornerSolved(s, slot))

/** Middle-layer inserts from both sides. */
const EDGE_INSERTS = (() => {
  const right = perSlot("U R U' R' U' F' U F", (s, slot) => !isMiddleEdgeSolved(s, slot))
  const left = perSlot("U' F' U F U R U' R'", (s, slot) => !isMiddleEdgeSolved(s, slot))
  return Object.fromEntries(SLOTS.map((s) => [s, [...right[s], ...left[s]]])) as Record<Slot, Macro[]>
})()

export const BEGINNER_ALGORITHMS = {
  corner: "R U R' U'",
  insertRight: "U R U' R' U' F' U F",
  insertLeft: "U' F' U F U R U' R'",
  topCross: "F R U R' U' F'",
  topEdges: "R U R' U R U2 R' U",
  topCornerPositions: "U R U' L' U R' U' L",
  topCornerOrientation: "R' D' R D",
} as const

// ---------------------------------------------------------------------------
// Tables (built on first use, cached)
// ---------------------------------------------------------------------------

const cache = new Map<string, MacroTable>()
const table = (key: string, build: () => MacroTable) => {
  let t = cache.get(key)
  if (!t) cache.set(key, (t = build()))
  return t
}

const slotTable = (
  kind: 'corner' | 'edge',
  slot: Slot,
  free: readonly Slot[],
): MacroTable =>
  table(`${kind}|${slot}|${[...free].sort().join(',')}`, () => {
    const moves = kind === 'corner' ? CORNER_TRIGGERS : EDGE_INSERTS
    const goal = kind === 'corner' ? markSlotCorner(SOLVED, slot) : markSlotEdge(SOLVED, slot)
    return buildMacroTable(goal, [...U_TURNS, ...moves[slot], ...free.flatMap((f) => moves[f])])
  })

const topCrossTable = () =>
  table('top-cross', () => buildMacroTable(markTopCross(SOLVED), [...U_TURNS, macro(BEGINNER_ALGORITHMS.topCross)]))

const topEdgesTable = () =>
  table('top-edges', () => buildMacroTable(markTopEdges(SOLVED), [...U_TURNS, macro(BEGINNER_ALGORITHMS.topEdges)]))

const topCornersTable = () =>
  table('top-corners', () =>
    buildMacroTable(markTopCornerPositions(SOLVED), allAngles(BEGINNER_ALGORITHMS.topCornerPositions).map((m) => macro(m))),
  )

/**
 * Only U turns are merged: "alg alg" keeps both copies visible even when
 * the end of one cancels the start of the next, because that's what a
 * beginner actually does.
 */
const tidy = (moves: Move[]) => simplifyMoves(moves, (base) => base === 'U')

const walk = (t: MacroTable, marked: string, what: string): Move[] => {
  const moves = walkMacroTable(t, marked)
  if (!moves) throw new UnsolvableCubeError(`${what}: the pieces are in an impossible arrangement`)
  return tidy(moves)
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

/** Solves one slot at a time, always the cheapest next one; inserts of solved slots are never used. */
const solveSlots = (
  state: CubeState,
  kind: 'corner' | 'edge',
): { slot: Slot; moves: Move[] }[] => {
  const solved = kind === 'corner' ? isFirstLayerCornerSolved : isMiddleEdgeSolved
  const mark = kind === 'corner' ? markSlotCorner : markSlotEdge
  const out: { slot: Slot; moves: Move[] }[] = []
  let s = state
  for (;;) {
    const open = SLOTS.filter((slot) => !solved(s, slot))
    if (open.length === 0) return out
    const best = open
      .map((slot) => {
        const free = open.filter((o) => o !== slot)
        return { slot, moves: walk(slotTable(kind, slot, free), mark(s, slot), `${slot} ${kind}`) }
      })
      .reduce((a, b) => (b.moves.length < a.moves.length ? b : a))
    out.push(best)
    s = applyMoves(s, best.moves)
  }
}

const UFR_TOP = facelet('U', 8)

/**
 * Twist each top corner in place with R' D' R D until its top colour faces
 * up, turning U to bring the next corner to the front-right. The bottom
 * layers look scrambled in between and come back after the last corner.
 */
const orientTopCorners = (state: CubeState): Move[] => {
  const sexy = parseAlgorithm(BEGINNER_ALGORITHMS.topCornerOrientation)
  const u = parseAlgorithm('U')
  const moves: Move[] = []
  let s = state
  for (let corner = 0; corner < 4; corner++) {
    for (let n = 0; s[UFR_TOP] !== 'U'; n++) {
      if (n >= 6) throw new UnsolvableCubeError('A top corner is twisted and cannot be oriented')
      moves.push(...sexy)
      s = applyMoves(s, sexy)
    }
    moves.push(...u)
    s = applyMoves(s, u)
  }
  return tidy(moves)
}

export const solveBeginner = (start: CubeState): Solution => {
  const steps: SolveStep[] = []
  let state = start
  const push = (step: SolveStep) => {
    steps.push(step)
    state = applyMoves(state, step.moves)
  }

  const fix = orientationFix(state)
  if (fix.length > 0) push({ stage: 'orientation', label: 'Rotate to standard orientation', moves: fix })

  push({ stage: 'cross', label: 'Cross', moves: solveCross(state) })
  for (const { slot, moves } of solveSlots(state, 'corner')) {
    push({ stage: 'first-layer', label: `First layer: ${slot} corner`, moves })
  }
  for (const { slot, moves } of solveSlots(state, 'edge')) {
    push({ stage: 'second-layer', label: `Middle layer: ${slot} edge`, moves })
  }
  push({ stage: 'last-layer', label: 'Top cross', moves: walk(topCrossTable(), markTopCross(state), 'Top cross') })
  push({ stage: 'last-layer', label: 'Top edges', moves: walk(topEdgesTable(), markTopEdges(state), 'Top edges') })
  push({
    stage: 'last-layer',
    label: 'Position top corners',
    moves: walk(topCornersTable(), markTopCornerPositions(state), 'Top corner positions'),
  })
  push({ stage: 'last-layer', label: 'Orient top corners', moves: orientTopCorners(state) })

  if (state !== SOLVED) throw new UnsolvableCubeError('The cube could not be solved, the state is probably invalid')
  return { steps, moves: simplifyMoves(steps.flatMap((s) => s.moves)) }
}

/** Table sizes, for tests. */
export const beginnerTableSizes = () => ({
  cornerFR: slotTable('corner', 'FR', []).dist.size,
  cornerFRAllFree: slotTable('corner', 'FR', ['FL', 'BR', 'BL']).dist.size,
  edgeFR: slotTable('edge', 'FR', []).dist.size,
  edgeFRAllFree: slotTable('edge', 'FR', ['FL', 'BR', 'BL']).dist.size,
  topCross: topCrossTable().dist.size,
  topEdges: topEdgesTable().dist.size,
  topCorners: topCornersTable().dist.size,
})

