import { CORNER_CUBIES, EDGE_CUBIES, cubieAt } from '../geometry.ts'
import { compileMoves, type Move } from '../moves.ts'
import { parseAlgorithm, simplifyMoves } from '../notation.ts'
import { SOLVED, type CubeState, type Face } from '../state.ts'
import { UnsolvableCubeError } from './errors.ts'

/*
 * F2L, one corner-edge pair at a time.
 *
 * The moves allowed are U turns plus the basic inserts for each slot
 * ("R U R'", "F' U' F", ...). Each insert only swaps pieces between its own
 * slot and the U layer, so the cross and every other slot stay untouched.
 *
 * For each target slot, a shortest-path search over every place the pair's
 * corner and edge can be (at most 8 * 3 * 8 * 2 = 384 states) gives a lookup
 * table: pair position -> distance to solved. Solving walks that table down.
 * Inserts of already-solved slots are left out of the search, so they are
 * never disturbed; inserts of unsolved slots are allowed, which is how a
 * piece stuck in the wrong slot gets taken out.
 */

export const SLOTS = ['FR', 'FL', 'BR', 'BL'] as const
export type Slot = (typeof SLOTS)[number]

interface SlotDef {
  sides: [Face, Face]
  x: number
  z: number
  inserts: string[]
}

const SLOT_DEFS: Record<Slot, SlotDef> = {
  FR: { sides: ['F', 'R'], x: 1, z: 1, inserts: ["R U R'", "R U' R'", "R U2 R'", "F' U F", "F' U' F", "F' U2 F"] },
  FL: { sides: ['F', 'L'], x: -1, z: 1, inserts: ["L' U L", "L' U' L", "L' U2 L", "F U F'", "F U' F'", "F U2 F'"] },
  BR: { sides: ['B', 'R'], x: 1, z: -1, inserts: ["R' U R", "R' U' R", "R' U2 R", "B U B'", "B U' B'", "B U2 B'"] },
  BL: { sides: ['B', 'L'], x: -1, z: -1, inserts: ["L U L'", "L U' L'", "L U2 L'", "B' U B", "B' U' B", "B' U2 B"] },
}

/** The insert algorithms for a slot (exported for tests). */
export const slotInserts = (slot: Slot): string[] => SLOT_DEFS[slot].inserts

const slotStickers = (slot: Slot) => {
  const { x, z } = SLOT_DEFS[slot]
  return { corner: cubieAt([x, -1, z]), edge: cubieAt([x, 0, z]) }
}

export const isSlotSolved = (state: CubeState, slot: Slot): boolean => {
  const { corner, edge } = slotStickers(slot)
  return [...corner, ...edge].every((i) => state[i] === SOLVED[i])
}

const sameColours = (state: CubeState, stickers: readonly number[], colours: readonly string[]) =>
  stickers.length === colours.length && colours.every((c) => stickers.some((i) => state[i] === c))

/**
 * Hides everything except the slot's corner and edge: corner stickers become
 * lower-case colour letters, edge stickers upper-case, the rest '.'. Two cube
 * states with the pair in the same place map to the same string, and moves
 * act on this string exactly like on a real state.
 */
const markPair = (state: CubeState, slot: Slot): string => {
  const [a, b] = SLOT_DEFS[slot].sides
  const corner = CORNER_CUBIES.find((c) => sameColours(state, c, ['D', a, b]))
  const edge = EDGE_CUBIES.find((e) => sameColours(state, e, [a, b]))
  if (!corner) throw new UnsolvableCubeError(`The D-${a}-${b} corner is missing`)
  if (!edge) throw new UnsolvableCubeError(`The ${a}-${b} edge is missing`)
  const marks = Array<string>(54).fill('.')
  for (const i of corner) marks[i] = state[i].toLowerCase()
  for (const i of edge) marks[i] = state[i]
  return marks.join('')
}

interface Macro {
  moves: Move[]
  apply: (s: string) => string
}

const macro = (alg: string): Macro => {
  const moves = parseAlgorithm(alg)
  return { moves, apply: compileMoves(moves) }
}

const U_TURNS = ['U', "U'", 'U2'].map(macro)
const INSERTS = Object.fromEntries(SLOTS.map((s) => [s, SLOT_DEFS[s].inserts.map(macro)])) as Record<Slot, Macro[]>

interface PairTable {
  macros: Macro[]
  dist: Map<string, number>
}

const tables = new Map<string, PairTable>()

/**
 * Shortest-path table for solving `slot`'s pair, where the inserts of
 * `freeSlots` may also be used. Built on first use and cached (at most
 * 4 slots x 8 subsets = 32 tables, each a few hundred entries).
 *
 * The allowed moves are closed under inverse (U <-> U', R U R' <-> R U' R'),
 * so searching outward from the solved pair gives the distance *to* solved.
 * Costs are move counts (U = 1, an insert = 3), hence the bucket queue.
 */
const pairTable = (slot: Slot, freeSlots: readonly Slot[]): PairTable => {
  const key = `${slot}|${[...freeSlots].sort().join(',')}`
  const cached = tables.get(key)
  if (cached) return cached

  const macros = [...U_TURNS, ...INSERTS[slot], ...freeSlots.flatMap((s) => INSERTS[s])]
  const goal = markPair(SOLVED, slot)
  const dist = new Map([[goal, 0]])
  const buckets: string[][] = [[goal]]
  for (let d = 0; d < buckets.length; d++) {
    for (const state of buckets[d] ?? []) {
      if (dist.get(state) !== d) continue
      for (const m of macros) {
        const next = m.apply(state)
        const nd = d + m.moves.length
        if ((dist.get(next) ?? Infinity) <= nd) continue
        dist.set(next, nd)
        ;(buckets[nd] ??= []).push(next)
      }
    }
  }
  const table = { macros, dist }
  tables.set(key, table)
  return table
}

/** Number of pair positions the table for this slot can solve (for tests). */
export const pairStateCount = (slot: Slot, freeSlots: readonly Slot[] = []): number =>
  pairTable(slot, freeSlots).dist.size

/**
 * Moves that solve `slot`'s pair without disturbing the cross or any slot
 * not listed in `freeSlots`.
 */
export const solvePair = (state: CubeState, slot: Slot, freeSlots: readonly Slot[] = []): Move[] => {
  const { macros, dist } = pairTable(slot, freeSlots)
  let marked = markPair(state, slot)
  let d = dist.get(marked)
  if (d === undefined) throw new UnsolvableCubeError(`The ${slot} pair is in an impossible orientation`)
  const moves: Move[] = []
  while (d > 0) {
    const m = macros.find((mac) => dist.get(mac.apply(marked)) === d! - mac.moves.length)!
    moves.push(...m.moves)
    marked = m.apply(marked)
    d = dist.get(marked)!
  }
  return simplifyMoves(moves)
}

export interface PairSolution {
  slot: Slot
  moves: Move[]
}

/**
 * Solves all four pairs, cross assumed solved. At each step every unsolved
 * pair is tried and the cheapest goes first, the way a speedcuber picks the
 * easiest-looking pair.
 */
export const solveF2L = (state: CubeState): PairSolution[] => {
  const solution: PairSolution[] = []
  let s = state
  for (;;) {
    const open = SLOTS.filter((slot) => !isSlotSolved(s, slot))
    if (open.length === 0) return solution
    const best = open
      .map((slot) => ({ slot, moves: solvePair(s, slot, open.filter((o) => o !== slot)) }))
      .reduce((a, b) => (b.moves.length < a.moves.length ? b : a))
    solution.push(best)
    s = compileMoves(best.moves)(s)
  }
}
