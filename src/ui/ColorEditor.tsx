import { useState, type PointerEvent } from 'react'
import { FACES, type CubeState, type Face } from '../cube/state.ts'
import { UNPAINTED, validateCube } from '../cube/validate.ts'
import { COLOR_NAMES, FACE_COLORS, UNPAINTED_COLOR, colorName } from '../view/colors.ts'
import { clearedCube, isCentre, paintSticker } from './editing.ts'

interface Props {
  value: CubeState
  paint: Face | typeof UNPAINTED
  onPaintChange: (paint: Face | typeof UNPAINTED) => void
  onChange: (state: CubeState) => void
  onCopyCurrent: () => void
  onUse: () => void
  onCancel: () => void
}

/** Where each face sits in the net, in sticker units (12 wide, 9 tall). */
const NET_OFFSET: Record<Face, [col: number, row: number]> = {
  U: [3, 0], L: [0, 3], F: [3, 3], R: [6, 3], B: [9, 3], D: [3, 6],
}


export const ColorEditor = ({ value, paint, onPaintChange, onChange, onCopyCurrent, onUse, onCancel }: Props) => {
  const issues = validateCube(value, colorName)
  const [dragging, setDragging] = useState(false)

  // Paint whatever sticker is under the pointer; works for mouse drags and touch.
  const paintAt = (e: PointerEvent) => {
    const el = document.elementFromPoint(e.clientX, e.clientY)
    const index = el instanceof HTMLElement ? el.dataset.sticker : undefined
    if (index !== undefined) onChange(paintSticker(value, Number(index), paint))
  }

  const counts = Object.fromEntries(FACES.map((f) => [f, [...value].filter((c) => c === f).length]))
  const unpainted = [...value].filter((c) => c === UNPAINTED).length

  return (
    <section className="panel-section editor">
      <h2>Enter your cube</h2>
      <p className="muted small">
        Hold the cube with {COLOR_NAMES.U} on top and {COLOR_NAMES.F} in front. Each face is drawn as you see it
        when you look straight at it; the net folds up into the cube. You can also paint on the 3D cube.
      </p>

      <div className="palette" role="radiogroup" aria-label="Paint colour">
        {FACES.map((f) => (
          <button
            key={f}
            role="radio"
            aria-checked={paint === f}
            className={`swatch ${paint === f ? 'selected' : ''}`}
            onClick={() => onPaintChange(f)}
            title={COLOR_NAMES[f]}
          >
            <span className="chip" style={{ background: FACE_COLORS[f] }} />
            <span className={`count ${counts[f] > 9 ? 'over' : counts[f] === 9 ? 'full' : ''}`}>{counts[f]}/9</span>
          </button>
        ))}
        <button
          role="radio"
          aria-checked={paint === UNPAINTED}
          className={`swatch ${paint === UNPAINTED ? 'selected' : ''}`}
          onClick={() => onPaintChange(UNPAINTED)}
          title="Eraser"
        >
          <span className="chip eraser" style={{ background: UNPAINTED_COLOR }} />
          <span className="count">{unpainted}</span>
        </button>
      </div>

      <div
        className="net"
        onPointerDown={(e) => {
          setDragging(true)
          ;(e.target as Element).releasePointerCapture?.(e.pointerId)
          paintAt(e)
        }}
        onPointerMove={(e) => dragging && paintAt(e)}
        onPointerUp={() => setDragging(false)}
        onPointerLeave={() => setDragging(false)}
      >
        {FACES.flatMap((f, k) =>
          Array.from({ length: 9 }, (_, i) => {
            const index = k * 9 + i
            const c = value[index] as Face | typeof UNPAINTED
            const [col, row] = NET_OFFSET[f]
            return (
              <div
                key={index}
                data-sticker={isCentre(index) ? undefined : index}
                className={`net-sticker ${isCentre(index) ? 'centre' : ''}`}
                style={{
                  gridColumn: col + (i % 3) + 1,
                  gridRow: row + Math.floor(i / 3) + 1,
                  background: c === UNPAINTED ? UNPAINTED_COLOR : FACE_COLORS[c],
                }}
                title={isCentre(index) ? `${COLOR_NAMES[f]} centre (fixed)` : undefined}
              />
            )
          }),
        )}
      </div>

      <div className="row">
        <button onClick={onCopyCurrent}>Copy current cube</button>
        <button onClick={() => onChange(clearedCube(value))}>Clear</button>
      </div>

      {issues.length > 0 ? (
        <ul className="issues">
          {issues.map((issue, i) => (
            <li key={i} className={issue.kind === 'unpainted' ? 'muted' : 'error'}>{issue.message}</li>
          ))}
        </ul>
      ) : (
        <p className="ok">This cube is solvable.</p>
      )}

      <div className="row">
        <button className="primary" onClick={onUse} disabled={issues.length > 0}>Use this cube</button>
        <button className="secondary" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  )
}
