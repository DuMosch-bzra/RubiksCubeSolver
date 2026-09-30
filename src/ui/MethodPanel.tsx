import { METHODS, type SolverSettings } from '../cube/solver/methods.ts'
import type { LookMode } from '../cube/solver/solve.ts'

interface Props {
  settings: SolverSettings
  disabled: boolean
  onChange: (settings: SolverSettings) => void
  /** Extra line under the method, e.g. table-building progress. */
  status?: string
}

const LOOK_OPTIONS: { value: LookMode; label: string; hint: string }[] = [
  { value: 'two-look', label: '2-look', hint: 'two steps, few algorithms' },
  { value: 'full', label: 'Full', hint: 'one algorithm per case' },
]

const Segmented = ({ label, value, disabled, onChange }: {
  label: string
  value: LookMode
  disabled: boolean
  onChange: (v: LookMode) => void
}) => (
  <div className="option-row">
    <span className="option-label">{label}</span>
    <div className="segmented" role="radiogroup" aria-label={label}>
      {LOOK_OPTIONS.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'selected' : ''}
          disabled={disabled}
          title={o.hint}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  </div>
)

export const MethodPanel = ({ settings, disabled, onChange, status }: Props) => (
  <section className="panel-section">
    <h2>Method</h2>
    <div className="methods" role="radiogroup" aria-label="Solving method">
      {METHODS.map((m) => (
        <button
          key={m.id}
          role="radio"
          aria-checked={settings.method === m.id}
          className={`method ${settings.method === m.id ? 'selected' : ''}`}
          disabled={disabled || !m.available}
          onClick={() => onChange({ ...settings, method: m.id })}
        >
          <span className="method-name">
            {m.name}
            {!m.available && <span className="badge">coming soon</span>}
          </span>
          <span className="method-summary">{m.summary}</span>
        </button>
      ))}
    </div>

    {settings.method === 'cfop' && (
      <div className="method-options">
        <Segmented
          label="OLL"
          value={settings.cfop.oll}
          disabled={disabled}
          onChange={(oll) => onChange({ ...settings, cfop: { ...settings.cfop, oll } })}
        />
        <Segmented
          label="PLL"
          value={settings.cfop.pll}
          disabled={disabled}
          onChange={(pll) => onChange({ ...settings, cfop: { ...settings.cfop, pll } })}
        />
      </div>
    )}
    {status && <p className="muted small method-status">{status}</p>}
  </section>
)
