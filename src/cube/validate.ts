import { CORNER_CUBIES, EDGE_CUBIES, STICKERS, dot, type Vec3 } from './geometry.ts'
import { FACES, SOLVED, type CubeState, type Face } from './state.ts'

/*
 * Explains why a hand-entered cube can't be solved. The solver would also
 * reject these states, but only with "no matching case"; here each
 * problem gets a message a person can act on.
 *
 * '?' marks a sticker that hasn't been painted yet.
 */

export const UNPAINTED = '?'

export type IssueKind =
  | 'centres'
  | 'unpainted'
  | 'count'
  | 'impossible-piece'
  | 'duplicate-piece'
  | 'missing-piece'
  | 'twist'
  | 'flip'
  | 'parity'

export interface CubeIssue {
  kind: IssueKind
  message: string
}

const OPPOSITE: Record<Face, Face> = { U: 'D', D: 'U', R: 'L', L: 'R', F: 'B', B: 'F' }
const faceOf = (sticker: number): Face => FACES[Math.floor(sticker / 9)]
const isUD = (c: string) => c === 'U' || c === 'D'
const isFB = (c: string) => c === 'F' || c === 'B'

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

/**
 * Corner stickers in a consistent rotational order (right-handed around
 * the outward normals), starting with the sticker on the U or D face.
 * Turning the cube never changes this order, so reading a corner's colours
 * this way tells a real corner from its mirror image, and the position of
 * the U/D colour gives its twist.
 */
const CORNERS: number[][] = CORNER_CUBIES.map((stickers) => {
  const [a, b, c] = stickers
  const order = dot(STICKERS[a].normal, cross(STICKERS[b].normal, STICKERS[c].normal)) > 0 ? [a, b, c] : [a, c, b]
  const start = order.findIndex((i) => isUD(faceOf(i)))
  return [0, 1, 2].map((k) => order[(start + k) % 3])
})

/** Edge stickers, primary first: the one on U/D, otherwise the one on F/B. */
const EDGES: number[][] = EDGE_CUBIES.map(([a, b]) => {
  const primary = isUD(faceOf(a)) || (!isUD(faceOf(b)) && isFB(faceOf(a)))
  return primary ? [a, b] : [b, a]
})

const HOME_CORNERS = CORNERS.map((s) => s.map((i) => SOLVED[i]).join(''))
const HOME_EDGES = EDGES.map((s) => s.map((i) => SOLVED[i]).join(''))
const sortedKey = (colours: string) => [...colours].sort().join('')

/** Permutation parity (0 even, 1 odd) via cycle count. */
const parity = (perm: number[]): number => {
  const seen = new Array(perm.length).fill(false)
  let cycles = 0
  for (let i = 0; i < perm.length; i++) {
    if (seen[i]) continue
    cycles++
    for (let j = i; !seen[j]; j = perm[j]) seen[j] = true
  }
  return (perm.length - cycles) % 2
}

const hasClash = (colours: string) =>
  [...colours].some((c, i) => [...colours].some((d, j) => i < j && (c === d || OPPOSITE[c as Face] === d)))

/**
 * Returns every problem found, in the order a person should fix them.
 * An empty list means the cube can be solved.
 *
 * `nameOf` turns a face letter into a colour name for the messages.
 */
export const validateCube = (state: CubeState, nameOf: (f: Face) => string = (f) => f): CubeIssue[] => {
  const issues: CubeIssue[] = []
  const names = (colours: string) => [...colours].map((c) => nameOf(c as Face)).join('-')

  if (FACES.some((f, k) => state[k * 9 + 4] !== f)) {
    return [{ kind: 'centres', message: `Centres must be in the standard position (${names('U')} on top, ${names('F')} in front)` }]
  }

  const unpainted = [...state].filter((c) => c === UNPAINTED).length
  if (unpainted > 0) {
    issues.push({ kind: 'unpainted', message: `${unpainted} sticker${unpainted === 1 ? '' : 's'} not painted yet` })
  }

  for (const f of FACES) {
    const n = [...state].filter((c) => c === f).length
    if (n > 9) issues.push({ kind: 'count', message: `Too many ${nameOf(f)} stickers (${n} of 9)` })
    else if (n < 9 && unpainted === 0) issues.push({ kind: 'count', message: `Too few ${nameOf(f)} stickers (${n} of 9)` })
  }

  // Pieces: impossible colour combinations, mirrored corners, duplicates.
  const cornerAt: number[] = []
  const edgeAt: number[] = []
  const seenPieces = new Map<string, number>()
  const note = (key: string) => seenPieces.set(key, (seenPieces.get(key) ?? 0) + 1)

  CORNERS.forEach((stickers) => {
    const colours = stickers.map((i) => state[i]).join('')
    if (colours.includes(UNPAINTED)) return
    if (hasClash(colours)) {
      issues.push({ kind: 'impossible-piece', message: `A corner shows ${names(colours)}, no real corner has that combination` })
      return
    }
    // Rotate the colours so the U/D colour comes first, then compare with the real corner.
    const ud = [...colours].findIndex(isUD)
    const normalised = [0, 1, 2].map((k) => colours[(ud + k) % 3]).join('')
    const home = HOME_CORNERS.indexOf(normalised)
    if (home < 0) {
      const real = HOME_CORNERS.find((h) => sortedKey(h) === sortedKey(colours)) ?? colours
      issues.push({ kind: 'impossible-piece', message: `The ${names(real)} corner is mirrored, two of its stickers are swapped` })
      return
    }
    note(`c${home}`)
    cornerAt.push(home)
  })

  EDGES.forEach((stickers) => {
    const colours = stickers.map((i) => state[i]).join('')
    if (colours.includes(UNPAINTED)) return
    if (hasClash(colours)) {
      issues.push({ kind: 'impossible-piece', message: `An edge shows ${names(colours)}, no real edge has that combination` })
      return
    }
    const home = HOME_EDGES.findIndex((h) => sortedKey(h) === sortedKey(colours))
    note(`e${home}`)
    edgeAt.push(home)
  })

  for (const [key, count] of seenPieces) {
    if (count < 2) continue
    const home = Number(key.slice(1))
    const kind = key[0] === 'c' ? 'corner' : 'edge'
    const colours = key[0] === 'c' ? HOME_CORNERS[home] : HOME_EDGES[home]
    issues.push({ kind: 'duplicate-piece', message: `The ${names(colours)} ${kind} appears ${count} times` })
  }
  if (unpainted === 0) {
    HOME_CORNERS.forEach((colours, i) => {
      if (!seenPieces.has(`c${i}`)) issues.push({ kind: 'missing-piece', message: `The ${names(colours)} corner is missing` })
    })
    HOME_EDGES.forEach((colours, i) => {
      if (!seenPieces.has(`e${i}`)) issues.push({ kind: 'missing-piece', message: `The ${names(colours)} edge is missing` })
    })
  }
  if (issues.length > 0) return issues

  // Every piece exists exactly once: check the three invariants.
  const twist = CORNERS.reduce((sum, stickers) => sum + stickers.findIndex((i) => isUD(state[i])), 0)
  if (twist % 3 !== 0) {
    issues.push({ kind: 'twist', message: 'One corner is twisted. Check which way round the corners were entered' })
  }

  const flips = EDGES.reduce((sum, [p], k) => {
    const colours = HOME_EDGES[edgeAt[k]]
    const pieceHasUD = [...colours].some(isUD)
    const primaryColour = pieceHasUD ? [...colours].find(isUD)! : [...colours].find(isFB)!
    return sum + (state[p] === primaryColour ? 0 : 1)
  }, 0)
  if (flips % 2 !== 0) {
    issues.push({ kind: 'flip', message: 'One edge is flipped. Check that no edge was entered the wrong way round' })
  }

  if (parity(cornerAt) !== parity(edgeAt)) {
    issues.push({ kind: 'parity', message: 'Two pieces are swapped. Check for two edges or two corners that were entered in each other’s place' })
  }
  return issues
}
