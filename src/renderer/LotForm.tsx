import { useState, type FormEvent } from 'react';
import type { Lot, LotInput } from '../shared/types';
import { validateLot, type LotField } from '../shared/validateLot';
import { fromLocalInputValue, toLocalInputValue } from './format';

interface Props {
  /** The lot being edited, or undefined when adding a new one. */
  lot?: Lot;
  onSave: (input: LotInput) => Promise<void>;
  onCancel: () => void;
}

// Inputs are kept as the strings the user typed and only converted on save,
// so a half-typed value like "12." does not get rewritten under the cursor.
interface FormValues {
  ticker: string;
  shares: string;
  buyPrice: string;
  boughtAt: string;
}

function initialValues(lot?: Lot): FormValues {
  if (!lot) {
    return { ticker: '', shares: '', buyPrice: '', boughtAt: toLocalInputValue(new Date().toISOString()) };
  }
  return {
    ticker: lot.ticker,
    shares: String(lot.shares),
    buyPrice: String(lot.buyPrice),
    boughtAt: toLocalInputValue(lot.boughtAt),
  };
}

export function LotForm({ lot, onSave, onCancel }: Props) {
  const [values, setValues] = useState<FormValues>(() => initialValues(lot));
  const [errors, setErrors] = useState<Partial<Record<LotField, string>>>({});
  const [saving, setSaving] = useState(false);

  const set = (field: keyof FormValues) => (value: string) => setValues((v) => ({ ...v, [field]: value }));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const result = validateLot({
      ticker: values.ticker,
      // An empty box becomes NaN rather than 0, so it fails with a clear message.
      shares: values.shares.trim() === '' ? Number.NaN : Number(values.shares),
      buyPrice: values.buyPrice.trim() === '' ? Number.NaN : Number(values.buyPrice),
      boughtAt: fromLocalInputValue(values.boughtAt),
    });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }

    setErrors({});
    setSaving(true);
    try {
      await onSave(result.value);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="lot-form" onSubmit={handleSubmit} noValidate>
      <h2>{lot ? `Edit ${lot.ticker} lot` : 'Add a lot'}</h2>

      <div className="field-row">
        <Field label="Ticker" error={errors.ticker}>
          <input
            value={values.ticker}
            onChange={(e) => set('ticker')(e.target.value.toUpperCase())}
            placeholder="MU"
            autoFocus={!lot}
            spellCheck={false}
          />
        </Field>
        <Field label="Shares" error={errors.shares}>
          <input
            value={values.shares}
            onChange={(e) => set('shares')(e.target.value)}
            inputMode="decimal"
            placeholder="1"
          />
        </Field>
      </div>

      <div className="field-row">
        <Field label="Buy price per share" error={errors.buyPrice}>
          <input
            value={values.buyPrice}
            onChange={(e) => set('buyPrice')(e.target.value)}
            inputMode="decimal"
            placeholder="850.00"
          />
        </Field>
        <Field label="Bought at" error={errors.boughtAt}>
          <input
            type="datetime-local"
            value={values.boughtAt}
            onChange={(e) => set('boughtAt')(e.target.value)}
          />
        </Field>
      </div>

      <div className="form-actions">
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" disabled={saving}>
          {lot ? 'Save changes' : 'Add lot'}
        </button>
      </div>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className={error ? 'field has-error' : 'field'}>
      <span className="field-label">{label}</span>
      {children}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}
