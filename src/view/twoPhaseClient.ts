import type { Move } from '../cube/moves.ts'
import { parseAlgorithm } from '../cube/notation.ts'
import { UnsolvableCubeError } from '../cube/solver/errors.ts'
import type { Solution } from '../cube/solver/solve.ts'
import { prepareTwoPhase, twoPhaseSolution } from '../cube/solver/twophase/index.ts'
import type { CubeState } from '../cube/state.ts'

/*
 * Talks to the two-phase worker. One worker for the whole app; its tables
 * are built once, on the first `warmUp` or `solve`.
 */

export type TablesStatus = { state: 'idle' } | { state: 'building'; fraction: number } | { state: 'ready' }

type Listener = (status: TablesStatus) => void

let worker: Worker | null = null
let status: TablesStatus = { state: 'idle' }
const listeners = new Set<Listener>()
const pending = new Map<number, { resolve: (m: { phase1: Move[]; phase2: Move[] }) => void; reject: (e: Error) => void }>()
let nextId = 0

const setStatus = (s: TablesStatus) => {
  status = s
  listeners.forEach((l) => l(s))
}

const getWorker = (): Worker => {
  if (worker) return worker
  worker = new Worker(new URL('../workers/twoPhase.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent) => {
    const msg = e.data
    if (msg.type === 'progress') {
      if (status.state !== 'ready') setStatus({ state: 'building', fraction: msg.fraction })
    } else if (msg.type === 'ready') {
      if (status.state !== 'ready') setStatus({ state: 'ready' })
    } else if (msg.type === 'solution') {
      pending.get(msg.id)?.resolve({ phase1: parseAlgorithm(msg.phase1), phase2: parseAlgorithm(msg.phase2) })
      pending.delete(msg.id)
    } else if (msg.type === 'error') {
      const error = msg.name === 'UnsolvableCubeError' ? new UnsolvableCubeError(msg.message) : new Error(msg.message)
      pending.get(msg.id)?.reject(error)
      pending.delete(msg.id)
    }
  }
  return worker
}

export const tablesStatus = (): TablesStatus => status

export const onTablesStatus = (listener: Listener): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Starts building the tables in the background (no-op once started). */
export const warmUp = (): void => {
  if (status.state !== 'idle') return
  setStatus({ state: 'building', fraction: 0 })
  getWorker().postMessage({ type: 'init' })
}

/** Solves in the worker. Validation happens here first, so bad input fails fast. */
export const solveTwoPhaseAsync = async (state: CubeState): Promise<Solution> => {
  const { fix, cube } = prepareTwoPhase(state)
  warmUp()
  const id = nextId++
  const moves = await new Promise<{ phase1: Move[]; phase2: Move[] }>((resolve, reject) => {
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ type: 'solve', id, state: cube })
  })
  return twoPhaseSolution(fix, moves)
}
