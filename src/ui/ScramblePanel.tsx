import { useState } from 'react'
import type { Move } from '../cube/moves.ts'
import { NotationError, formatAlgorithm, parseAlgorithm } from '../cube/notation.ts'
import { randomScramble } from '../cube/scramble.ts'

interface Props {
  disabled: boolean
  onScramble: (moves: Move[]) => void
  onReset: () => void
}

export const ScramblePanel = ({ disabled, onScramble, onReset }: Props) => {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const apply = (value: string) => {
    try {
      const moves = parseAlgorithm(value)
      setError(null)
      onScramble(moves)
    } catch (e) {
      if (e instanceof NotationError) setError(e.message)
      else throw e
    }
  }

  const random = () => {
    const scramble = formatAlgorithm(randomScramble())
    setText(scramble)
    apply(scramble)
  }

  return (
    <section className="panel-section">
      <h2>Scramble</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          apply(text)
        }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              apply(text)
            }
          }}
          placeholder="e.g. R U R' U' F2 D"
          rows={3}
          spellCheck={false}
          aria-invalid={error !== null}
        />
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button type="submit" disabled={disabled}>Apply</button>
          <button type="button" onClick={random} disabled={disabled}>Random</button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setText('')
              setError(null)
              onReset()
            }}
          >
            Reset
          </button>
        </div>
      </form>
    </section>
  )
}
