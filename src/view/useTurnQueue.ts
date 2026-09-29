import { useCallback, useReducer } from 'react'
import { applyMove, type Move } from '../cube/moves.ts'
import { SOLVED, type CubeState } from '../cube/state.ts'

/** A move being animated. `id` makes two identical moves in a row distinct. */
export interface Turn {
  move: Move
  id: number
}

interface QueueState {
  /** The cube at rest, before the current turn. */
  cube: CubeState
  turn: Turn | null
  queue: Move[]
  nextId: number
}

type Action =
  | { type: 'enqueue'; moves: readonly Move[] }
  | { type: 'turnDone' }
  | { type: 'reset'; cube: CubeState }

const startNext = (s: QueueState): QueueState => {
  if (s.turn || s.queue.length === 0) return s
  const [move, ...rest] = s.queue
  return { ...s, turn: { move, id: s.nextId }, queue: rest, nextId: s.nextId + 1 }
}

const reducer = (s: QueueState, a: Action): QueueState => {
  switch (a.type) {
    case 'enqueue':
      return startNext({ ...s, queue: [...s.queue, ...a.moves] })
    case 'turnDone':
      if (!s.turn) return s
      return startNext({ ...s, cube: applyMove(s.cube, s.turn.move), turn: null })
    case 'reset':
      return { ...s, cube: a.cube, turn: null, queue: [] }
  }
}

/**
 * Plays moves one at a time. The view animates `turn`, then calls
 * `turnDone`, which commits the move to `cube` and starts the next one.
 */
export const useTurnQueue = (initial: CubeState = SOLVED) => {
  const [state, dispatch] = useReducer(reducer, { cube: initial, turn: null, queue: [], nextId: 0 })
  return {
    cube: state.cube,
    turn: state.turn,
    busy: state.turn !== null || state.queue.length > 0,
    /** Moves waiting after the current turn. */
    pending: state.queue.length,
    enqueue: useCallback((moves: readonly Move[]) => dispatch({ type: 'enqueue', moves }), []),
    turnDone: useCallback(() => dispatch({ type: 'turnDone' }), []),
    reset: useCallback((cube: CubeState) => dispatch({ type: 'reset', cube }), []),
  }
}
