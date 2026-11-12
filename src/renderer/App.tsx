import { useEffect, useMemo, useState } from 'react';
import { buildPositions } from '../shared/pnl';
import type { Lot, LotInput } from '../shared/types';
import { formatMoney } from './format';
import { LotForm } from './LotForm';
import { PositionCard } from './PositionCard';

// What the form panel is doing: closed, adding a new lot, or editing one.
type FormState = { mode: 'closed' } | { mode: 'add' } | { mode: 'edit'; lot: Lot };

export function App() {
  const [lots, setLots] = useState<Lot[] | null>(null);
  const [form, setForm] = useState<FormState>({ mode: 'closed' });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.portfolio.listLots().then(setLots, (e: unknown) => setError(messageOf(e)));
  }, []);

  const positions = useMemo(() => buildPositions(lots ?? []), [lots]);
  const totalCost = positions.reduce((total, p) => total + p.costBasis, 0);

  // Every change returns the full, saved list from the main process,
  // so the screen always matches what is on disk.
  async function run(change: () => Promise<Lot[]>) {
    try {
      setLots(await change());
      setError(null);
      setForm({ mode: 'closed' });
    } catch (e) {
      setError(messageOf(e));
    }
  }

  const save = (input: LotInput) =>
    form.mode === 'edit'
      ? run(() => window.portfolio.updateLot(form.lot.id, input))
      : run(() => window.portfolio.addLot(input));

  return (
    <div className="app">
      <header className="app-header">
        <h1>Portfolio</h1>
        {form.mode === 'closed' && <button onClick={() => setForm({ mode: 'add' })}>Add lot</button>}
      </header>

      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}

      {form.mode !== 'closed' && (
        <LotForm
          // A new key resets the form's fields when switching between lots.
          key={form.mode === 'edit' ? form.lot.id : 'new'}
          lot={form.mode === 'edit' ? form.lot : undefined}
          onSave={save}
          onCancel={() => setForm({ mode: 'closed' })}
        />
      )}

      <main className="positions">
        {lots === null && !error && <p className="muted">Loading...</p>}
        {lots?.length === 0 && form.mode === 'closed' && (
          <p className="empty">No lots yet. Add your first purchase to get started.</p>
        )}
        {positions.map((position) => (
          <PositionCard
            key={position.ticker}
            position={position}
            onEdit={(lot) => setForm({ mode: 'edit', lot })}
            onDelete={(lot) => run(() => window.portfolio.deleteLot(lot.id))}
          />
        ))}
      </main>

      {positions.length > 0 && (
        <footer className="app-footer">
          <span>
            {positions.length} {positions.length === 1 ? 'position' : 'positions'}
          </span>
          <span>Cost basis {formatMoney(totalCost)}</span>
        </footer>
      )}
    </div>
  );
}

function messageOf(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  // Errors from the main process arrive wrapped as "Error invoking remote method 'x': Error: ...".
  return text.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}
