import { BASE_MOVES, type Amount, type BaseMove, type Move } from './moves.ts'

export class NotationError extends Error {}

const WIDE_ALIASES: Record<string, BaseMove> = {
  Uw: 'u', Dw: 'd', Rw: 'r', Lw: 'l', Fw: 'f', Bw: 'b',
}

const TOKEN = /^([UDRLFBudrlfbMESxyz]w?)(2|3)?('?)$/

/**
 * Parses standard notation, e.g. "R U R' U'", "Rw2 M' y", "(R U2 R')".
 * Brackets are ignored; "R2'" and "R3" are accepted. Throws NotationError on
 * anything it doesn't recognise, naming the offending token.
 */
export const parseAlgorithm = (text: string): Move[] =>
  text
    .replace(/[()[\]]/g, ' ')
    .replace(/[’`´]/g, "'")
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((token) => {
      const m = TOKEN.exec(token)
      if (!m) throw new NotationError(`Unknown move "${token}"`)
      const [, name, count, prime] = m
      const base = (WIDE_ALIASES[name] ?? name) as BaseMove
      if (!BASE_MOVES.includes(base)) throw new NotationError(`Unknown move "${token}"`)
      const turns = Number(count ?? 1) * (prime ? -1 : 1)
      return { base, amount: (((turns % 4) + 4) % 4) as Amount }
    })

export const formatMove = ({ base, amount }: Move): string =>
  base + (amount === 2 ? '2' : amount === 3 ? "'" : '')

export const formatAlgorithm = (moves: readonly Move[]): string => moves.map(formatMove).join(' ')

export const invertMove = ({ base, amount }: Move): Move => ({ base, amount: (4 - amount) as Amount })

export const invertAlgorithm = (moves: readonly Move[]): Move[] => [...moves].reverse().map(invertMove)

/**
 * Merges consecutive turns of the same layer: "U U" -> "U2", "R R'" -> "",
 * "R U U' R'" -> "". Doesn't reorder commuting moves (R L R stays).
 */
export const simplifyMoves = (moves: readonly Move[]): Move[] => {
  const out: Move[] = []
  for (const m of moves) {
    const last = out.at(-1)
    if (last && last.base === m.base) {
      out.pop()
      const amount = (last.amount + m.amount) % 4
      if (amount !== 0) out.push({ base: m.base, amount: amount as Amount })
    } else {
      out.push(m)
    }
  }
  return out
}
