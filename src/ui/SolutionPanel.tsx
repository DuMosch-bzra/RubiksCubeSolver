import type { Solution } from '../cube/solver/solve.ts'
import { formatMove } from '../cube/notation.ts'

interface Props {
  solution: Solution
  /** Number of solution moves already played (or queued). */
  cursor: number
  playing: boolean
  speed: number
  onPlayPause: () => void
  onNext: () => void
  onPrev: () => void
  onJump: (moveIndex: number) => void
  onSpeed: (speed: number) => void
}

export const SolutionPanel = ({
  solution, cursor, playing, speed, onPlayPause, onNext, onPrev, onJump, onSpeed,
}: Props) => {
  // Index of each step's first move in the flat move list.
  const starts = solution.steps.map((_, i) => solution.steps.slice(0, i).reduce((n, s) => n + s.moves.length, 0))
  const total = solution.steps.reduce((n, s) => n + s.moves.length, 0)

  return (
    <section className="panel-section solution">
      <h2>
        Solution <span className="muted">{cursor} / {total} moves</span>
      </h2>

      <div className="row transport">
        <button onClick={() => onJump(0)} disabled={cursor === 0} title="Back to start">⏮</button>
        <button onClick={onPrev} disabled={cursor === 0} title="Previous move (←)">◀</button>
        <button className="primary" onClick={onPlayPause} disabled={cursor === total && !playing} title="Play / pause (space)">
          {playing ? '❚❚' : '▶'}
        </button>
        <button onClick={onNext} disabled={cursor === total} title="Next move (→)">▶|</button>
        <button onClick={() => onJump(total)} disabled={cursor === total} title="Jump to the end">⏭</button>
      </div>

      <label className="speed">
        Speed
        <input type="range" min={1} max={10} step={0.5} value={speed} onChange={(e) => onSpeed(Number(e.target.value))} />
        <span className="muted">{speed} turns/s</span>
      </label>

      <ol className="steps">
        {solution.steps.map((step, s) => {
          const start = starts[s]
          const offset = start + step.moves.length
          const active = cursor >= start && cursor < offset
          return (
            <li key={s} className={active ? 'active' : cursor >= offset ? 'done' : ''}>
              <button className="step-title" onClick={() => onJump(start)}>
                <span>{step.label}</span>
                {step.caseName && <span className="case">{step.caseName}</span>}
              </button>
              {step.moves.length === 0 ? (
                <span className="muted small">no moves needed</span>
              ) : (
                <div className="moves">
                  {step.moves.map((m, k) => {
                    const index = start + k
                    return (
                      <button
                        key={k}
                        className={`move ${index < cursor ? 'played' : ''} ${index === cursor ? 'next' : ''}`}
                        onClick={() => onJump(index + 1)}
                        title={`Jump to after move ${index + 1}`}
                      >
                        {formatMove(m)}
                      </button>
                    )
                  })}
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
