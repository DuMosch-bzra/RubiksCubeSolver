import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import './App.css'
import { applyMoves, type Move } from './cube/moves.ts'
import { invertMove } from './cube/notation.ts'
import { UnsolvableCubeError } from './cube/solver/errors.ts'
import { MethodNotAvailableError, describeSettings, solve, type SolverSettings } from './cube/solver/methods.ts'
import type { Solution } from './cube/solver/solve.ts'
import { MethodPanel } from './ui/MethodPanel.tsx'
import { loadSettings, saveSettings } from './ui/settingsStorage.ts'
import { SOLVED, isSolved, type CubeState, type Face } from './cube/state.ts'
import type { UNPAINTED } from './cube/validate.ts'
import { ColorEditor } from './ui/ColorEditor.tsx'
import { paintSticker } from './ui/editing.ts'
import { ScramblePanel } from './ui/ScramblePanel.tsx'
import { SolutionPanel } from './ui/SolutionPanel.tsx'
import { Cube3D } from './view/Cube3D.tsx'
import { onTablesStatus, solveTwoPhaseAsync, tablesStatus, warmUp } from './view/twoPhaseClient.ts'
import { useTurnQueue } from './view/useTurnQueue.ts'

/** Quarter turns per second while a scramble plays. */
const SCRAMBLE_SPEED = 12

interface ActiveSolution {
  start: CubeState
  solution: Solution
  /** All moves, flattened per step as displayed (not simplified across steps). */
  moves: Move[]
}

const App = () => {
  const { cube, turn, busy, pending, enqueue, turnDone, reset } = useTurnQueue()
  const [speed, setSpeed] = useState(3)
  const [active, setActive] = useState<ActiveSolution | null>(null)
  const [cursor, setCursor] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Colour editor: the cube being painted, or null when not editing. */
  const [editing, setEditing] = useState<CubeState | null>(null)
  const [paint, setPaint] = useState<Face | typeof UNPAINTED>('U')
  const [settings, setSettings] = useState<SolverSettings>(loadSettings)
  /** A two-phase search is running in the worker. */
  const [computing, setComputing] = useState(false)
  /** Bumped whenever a pending solve result would be out of date (cube changed, solution cleared). */
  const solveRequest = useRef(0)
  const twoPhaseTables = useSyncExternalStore(onTablesStatus, tablesStatus)

  // Build the two-phase tables in the background as soon as that method is chosen.
  useEffect(() => {
    if (settings.method === 'two-phase') warmUp()
  }, [settings.method])

  const clearSolution = () => {
    solveRequest.current++
    setComputing(false)
    setActive(null)
    setCursor(0)
    setPlaying(false)
    setError(null)
  }

  /** Scrambles play out from a solved cube, fast. */
  const scramble = (moves: Move[]) => {
    clearSolution()
    reset(SOLVED)
    enqueue(moves, SCRAMBLE_SPEED)
  }

  const runSolver = (with_: SolverSettings = settings) => {
    const from = cube
    const request = ++solveRequest.current
    const show = (solution: Solution) => {
      if (request !== solveRequest.current) return // the cube changed while we were solving
      setComputing(false)
      setActive({ start: from, solution, moves: solution.steps.flatMap((s) => s.moves) })
      setCursor(0)
      setPlaying(false)
      setError(null)
    }
    const fail = (e: unknown) => {
      if (request !== solveRequest.current) return
      setComputing(false)
      if (e instanceof UnsolvableCubeError || e instanceof MethodNotAvailableError) setError(e.message)
      else {
        console.error(e)
        setError(`The solver failed: ${(e as Error).message}`)
      }
    }
    if (with_.method === 'two-phase') {
      setComputing(true)
      setError(null)
      setActive(null)
      solveTwoPhaseAsync(from).then(show, fail)
      return
    }
    try {
      show(solve(from, with_))
    } catch (e) {
      fail(e)
    }
  }

  /** New settings apply right away: a shown solution is recomputed from where the cube is now. */
  const changeSettings = (next: SolverSettings) => {
    setSettings(next)
    saveSettings(next)
    if (active && !isSolved(cube)) runSolver(next)
    else if (active) clearSolution()
  }

  const total = active?.moves.length ?? 0

  const next = useCallback(() => {
    if (!active || cursor >= total) return
    enqueue([active.moves[cursor]])
    setCursor(cursor + 1)
  }, [active, cursor, total, enqueue])

  const prev = useCallback(() => {
    if (!active || cursor === 0) return
    setPlaying(false)
    enqueue([invertMove(active.moves[cursor - 1])])
    setCursor(cursor - 1)
  }, [active, cursor, enqueue])

  const jump = (index: number) => {
    if (!active) return
    setPlaying(false)
    reset(applyMoves(active.start, active.moves.slice(0, index)))
    setCursor(index)
  }

  const playPause = useCallback(() => {
    if (!active) return
    if (playing) return setPlaying(false)
    if (cursor >= total) return
    setPlaying(true)
    if (!busy) next()
  }, [active, playing, cursor, total, busy, next])

  // Auto-play: when a turn finishes, feed the next solution move.
  const onTurnDone = () => {
    turnDone()
    if (!playing || pending > 0) return
    if (cursor < total) next()
    else setPlaying(false)
  }

  // Keyboard: space = play/pause, arrows = step.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing !== null) return
      const t = e.target
      // Let text fields keep their keys; the speed slider keeps its arrows.
      if (t instanceof HTMLTextAreaElement) return
      if (t instanceof HTMLInputElement && t.type !== 'range') return
      if (e.key === ' ') {
        // Also stops a focused button from treating space as a click (double toggle).
        e.preventDefault()
        playPause()
      } else if (t instanceof HTMLInputElement) {
        return
      } else if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [playPause, next, prev, editing])

  return (
    <div className="app">
      <main className="viewport">
        <Canvas camera={{ position: [4.2, 4, 5.6], fov: 40 }}>
          <ambientLight intensity={1.6} />
          <directionalLight position={[5, 8, 6]} intensity={1.4} />
          <directionalLight position={[-6, -4, -5]} intensity={0.5} />
          <Cube3D
            state={editing ?? cube}
            turn={editing === null ? turn : null}
            speed={speed}
            onTurnDone={onTurnDone}
            onStickerClick={editing === null ? undefined : (i) => setEditing(paintSticker(editing, i, paint))}
            idleEnabled={editing === null}
          />
          <OrbitControls enablePan={false} minDistance={5} maxDistance={14} />
        </Canvas>
        <p className="hint">Drag to look around · scroll to zoom</p>
      </main>

      <aside className="panel">
        <header>
          <h1>Rubik&apos;s Cube Solver</h1>
          <p className="muted small">{describeSettings(settings)}</p>
        </header>

        {editing !== null ? (
          <ColorEditor
            value={editing}
            paint={paint}
            onPaintChange={setPaint}
            onChange={setEditing}
            onCopyCurrent={() => setEditing(cube)}
            onUse={() => {
              clearSolution()
              reset(editing)
              setEditing(null)
            }}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <>
            <ScramblePanel
              disabled={busy}
              onScramble={scramble}
              onReset={() => {
                clearSolution()
                reset(SOLVED)
              }}
            />

            <MethodPanel
              settings={settings}
              disabled={busy || computing}
              onChange={changeSettings}
              status={
                settings.method !== 'two-phase'
                  ? undefined
                  : twoPhaseTables.state === 'building'
                    ? `Preparing search tables… ${Math.round(twoPhaseTables.fraction * 100)}%`
                    : twoPhaseTables.state === 'ready'
                      ? 'Search tables ready. Solving takes up to about 1.5 s.'
                      : undefined
              }
            />

            <section className="panel-section">
              <button className="wide" onClick={() => { setPlaying(false); setEditing(cube) }} disabled={busy}>
                Enter colours of a real cube
              </button>
            </section>

            {!active && (
              <section className="panel-section">
                <button className="primary wide" onClick={() => runSolver()} disabled={busy || computing || isSolved(cube)}>
                  {isSolved(cube) ? 'Already solved' : computing ? 'Searching…' : 'Solve'}
                </button>
                {error && <p className="error">{error}</p>}
              </section>
            )}

            {active && (
              <SolutionPanel
                solution={active.solution}
                cursor={cursor}
                playing={playing}
                speed={speed}
                onPlayPause={playPause}
                onNext={next}
                onPrev={prev}
                onJump={jump}
                onSpeed={setSpeed}
              />
            )}
          </>
        )}
      </aside>
    </div>
  )
}

export default App
