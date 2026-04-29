import { useState } from 'react';
import type { WeightConfig } from '../types';
import { DEFAULT_WEIGHT } from '../types';

interface Props {
  targetSkus: string[];
  initialWeight: WeightConfig;
  onApply: (weight: WeightConfig) => void;
  onClose: () => void;
}

const PERIODS: { key: keyof WeightConfig; label: string; days: string }[] = [
  { key: 'w7',  label: '7-Day Average',  days: '7d'  },
  { key: 'w15', label: '15-Day Average', days: '15d' },
  { key: 'w30', label: '30-Day Average', days: '30d' },
  { key: 'w60', label: '60-Day Average', days: '60d' },
  { key: 'w90', label: '90-Day Average', days: '90d' },
];

export default function WeightModal({ targetSkus, initialWeight, onApply, onClose }: Props) {
  const [draft, setDraft] = useState<WeightConfig>({ ...initialWeight });

  const total = draft.w7 + draft.w15 + draft.w30 + draft.w60 + draft.w90;
  const isValid = Math.abs(total - 100) < 0.01;

  function handleChange(key: keyof WeightConfig, raw: string) {
    const val = parseFloat(raw);
    setDraft(d => ({ ...d, [key]: isNaN(val) ? 0 : Math.max(0, Math.min(100, val)) }));
  }

  return (
    <div className="wmodal-overlay" onClick={onClose}>
      <div className="wmodal" onClick={e => e.stopPropagation()}>

        <div className="wmodal__header">
          <div className="wmodal__title">Configure Weightage</div>
          <div className="wmodal__subtitle">
            {targetSkus.length === 1
              ? `SKU: ${targetSkus[0]}`
              : `Applying to ${targetSkus.length} SKUs`}
          </div>
          <button className="wmodal__close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="wmodal__body">
          <p className="wmodal__desc">
            Assign a weight to each time period. Weights must total exactly <strong>100%</strong>.
            The Weighted Forecast Average is calculated as the sum of each period's average multiplied
            by its weight.
          </p>

          <div className="wmodal__fields">
            {PERIODS.map(({ key, label, days }) => (
              <div key={key} className="wmodal__field">
                <label className="wmodal__field-label">
                  <span className="wmodal__field-period">{days}</span>
                  {label}
                </label>
                <div className="wmodal__field-input-wrap">
                  <input
                    type="number"
                    className="wmodal__field-input"
                    value={draft[key]}
                    min={0}
                    max={100}
                    step={1}
                    onChange={e => handleChange(key, e.target.value)}
                  />
                  <span className="wmodal__field-pct">%</span>
                </div>
              </div>
            ))}
          </div>

          <div className={`wmodal__total ${isValid ? 'wmodal__total--ok' : 'wmodal__total--warn'}`}>
            <span>Total:</span>
            <strong>{total.toFixed(1)}%</strong>
            {isValid
              ? <span className="wmodal__total-hint">✓ Ready to apply</span>
              : <span className="wmodal__total-hint">Must equal 100% (currently {total > 100 ? '+' : ''}{(total - 100).toFixed(1)}%)</span>
            }
          </div>
        </div>

        <div className="wmodal__footer">
          <button
            className="btn btn--outline"
            onClick={() => setDraft({ ...DEFAULT_WEIGHT })}
          >
            Reset to Default
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn btn--outline" onClick={onClose}>Cancel</button>
          <button
            className="btn btn--primary"
            onClick={() => isValid && onApply(draft)}
            disabled={!isValid}
            style={{ opacity: isValid ? 1 : 0.45, cursor: isValid ? 'pointer' : 'not-allowed' }}
          >
            Apply{targetSkus.length > 1 ? ` to ${targetSkus.length} SKUs` : ''}
          </button>
        </div>

      </div>
    </div>
  );
}
