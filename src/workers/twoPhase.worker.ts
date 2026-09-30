/*
 * Runs the two-phase solver off the main thread: building its tables takes
 * a moment and a search can take up to the time limit, neither of which
 * should freeze the page.
 *
 * Messages in:  { type: 'init' } | { type: 'solve', id, state }
 * Messages out: { type: 'progress', fraction, label } | { type: 'ready' }
 *               { type: 'solution', id, phase1, phase2 } | { type: 'error', id, name, message }
 */
import { formatAlgorithm } from '../cube/notation.ts'
import { getTables, twoPhaseSearch } from '../cube/solver/twophase/index.ts'

interface WorkerScope {
  postMessage: (message: unknown) => void
  onmessage: ((e: MessageEvent) => void) | null
}
const scope = self as unknown as WorkerScope

const ensureTables = () =>
  getTables((fraction, label) => scope.postMessage({ type: 'progress', fraction, label }))

scope.onmessage = (e: MessageEvent) => {
  const msg = e.data as { type: 'init' } | { type: 'solve'; id: number; state: string }
  if (msg.type === 'init') {
    ensureTables()
    scope.postMessage({ type: 'ready' })
    return
  }
  try {
    ensureTables()
    scope.postMessage({ type: 'ready' })
    const { phase1, phase2 } = twoPhaseSearch(msg.state)
    scope.postMessage({ type: 'solution', id: msg.id, phase1: formatAlgorithm(phase1), phase2: formatAlgorithm(phase2) })
  } catch (err) {
    const error = err as Error
    scope.postMessage({ type: 'error', id: msg.id, name: error.name, message: error.message })
  }
}
