import { useState, type FormEvent } from 'react';
import type { AlertSettings } from '../shared/types';
import { validateAlerts, type AlertField } from '../shared/validateAlerts';

interface Props {
  ticker: string;
  settings: AlertSettings;
  onSave: (settings: AlertSettings) => Promise<void>;
  onCancel: () => void;
}

const asText = (value: number | null) => (value === null ? '' : String(value));
// An empty box means the alert is off.
const asNumber = (text: string) => (text.trim() === '' ? null : Number(text));

export function AlertEditor({ ticker, settings, onSave, onCancel }: Props) {
  const [dayMove, setDayMove] = useState(asText(settings.dayMovePct));
  const [gain, setGain] = useState(asText(settings.gainPct));
  const [loss, setLoss] = useState(asText(settings.lossPct));
  const [earnings, setEarnings] = useState(settings.earnings);
  const [news, setNews] = useState(settings.news);
  const [errors, setErrors] = useState<Partial<Record<AlertField, string>>>({});

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const result = validateAlerts({
      dayMovePct: asNumber(dayMove),
      gainPct: asNumber(gain),
      lossPct: asNumber(loss),
      earnings,
      news,
    });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    await onSave(result.value);
  }

  return (
    <form className="alert-editor" onSubmit={handleSubmit} noValidate>
      <p className="muted small">Notify me about {ticker} when... Leave a box empty to turn that alert off.</p>

      <PercentRow label="Today's move passes" prefix="±" value={dayMove} onChange={setDayMove} error={errors.dayMovePct} />
      <PercentRow label="Total P&L reaches" prefix="+" value={gain} onChange={setGain} error={errors.gainPct} />
      <PercentRow label="Total P&L reaches" prefix="-" value={loss} onChange={setLoss} error={errors.lossPct} />

      <label className="check">
        <input type="checkbox" checked={earnings} onChange={(e) => setEarnings(e.target.checked)} />
        Earnings within a day
      </label>
      <label className="check">
        <input type="checkbox" checked={news} onChange={(e) => setNews(e.target.checked)} />
        New company news
      </label>

      <div className="form-actions">
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit">Save alerts</button>
      </div>
    </form>
  );
}

interface RowProps {
  label: string;
  prefix: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

function PercentRow({ label, prefix, value, onChange, error }: RowProps) {
  return (
    <label className={error ? 'alert-row has-error' : 'alert-row'}>
      <span>{label}</span>
      <span className="percent-input">
        {prefix}
        <input value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" placeholder="off" />%
      </span>
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

/** A short line for the card, e.g. "±3% today · +20% / -10% overall · earnings". */
export function describeAlerts(settings: AlertSettings): string {
  const parts: string[] = [];
  if (settings.dayMovePct !== null) parts.push(`±${settings.dayMovePct}% today`);
  const targets = [
    settings.gainPct !== null ? `+${settings.gainPct}%` : null,
    settings.lossPct !== null ? `-${settings.lossPct}%` : null,
  ].filter(Boolean);
  if (targets.length > 0) parts.push(`${targets.join(' / ')} overall`);
  if (settings.earnings) parts.push('earnings');
  if (settings.news) parts.push('news');
  return parts.length > 0 ? parts.join(' · ') : 'off';
}
