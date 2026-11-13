import { useEffect, useMemo, useState } from 'react';
import { buildPositions, summarizePortfolio, summarizePosition } from '../shared/pnl';
import type { Lot, LotInput, QuoteSnapshot } from '../shared/types';
import { formatMoney } from './format';
import { LotForm } from './LotForm';
import { Change, PositionCard } from './PositionCard';
import { StatusBar } from './StatusBar';

// What the form panel is doing: closed, adding a new lot, or editing one.
type FormState = { mode: 'closed' } | { mode: 'add' } | { mode: 'edit'; lot: Lot };

export function App() {
  const [lots, setLots] = useState<Lot[] | null>(null);
  const [snapshot, setSnapshot] = useState<QuoteSnapshot | null>(null);
  const [form, setForm] = useState<FormState>({ mode: 'closed' });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.portfolio.listLots().then(setLots, (e: unknown) => setError(messageOf(e)));
  }, []);

  useEffect(() => {
    // Listen first, then ask for the current prices, so an update that lands in between is not missed.
    const stop = window.portfolio.onQuotes(setSnapshot);
    void window.portfolio.getQuotes().then(setSnapshot);
    return stop;
  }, []);

  const positions = useMemo(() => buildPositions(lots ?? []), [lots]);

  // P&L for every position that has a price. Positions without one show cost only.
  const results = useMemo(
    () =>
      positions.flatMap((position) => {
        const quote = snapshot?.quotes[position.ticker];
        return quote?.status === 'ok' ? [summarizePosition(position, quote.quote)] : [];
      }),
    [positions, snapshot],
  );
  const total = summarizePortfolio(results);
  const unpriced = positions.filter((p) => !results.some((r) => r.position.ticker === p.ticker));

  // Only say "waiting" while a refresh could still bring a price.
  const noQuoteText = snapshot?.missingKey
    ? 'No price: no API key'
    : snapshot?.error
      ? 'No price yet'
      : 'Waiting for price...';

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

      <StatusBar snapshot={snapshot} />

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
            quote={snapshot?.quotes[position.ticker]}
            noQuoteText={noQuoteText}
            result={results.find((r) => r.position.ticker === position.ticker) ?? null}
            onEdit={(lot) => setForm({ mode: 'edit', lot })}
            onDelete={(lot) => run(() => window.portfolio.deleteLot(lot.id))}
          />
        ))}
      </main>

      {positions.length > 0 && (
        <footer className="app-footer">
          {results.length > 0 ? (
            <>
              <div className="footer-row">
                <span>Invested</span>
                <span>{formatMoney(total.costBasis)}</span>
              </div>
              <div className="footer-row">
                <span>Value now</span>
                <span>{formatMoney(total.marketValue)}</span>
              </div>
              <div className="footer-row footer-total">
                <span>Total P&amp;L</span>
                <Change value={total.pnl} percent={total.pnlPct} />
              </div>
              <div className="footer-row muted">
                <span>Today</span>
                <Change value={total.dayChange} percent={total.dayChangePct} />
              </div>
              {unpriced.length > 0 && (
                // Unpriced positions are left out of all four lines above, so Value now minus
                // Invested always equals Total P&L.
                <p className="footer-note muted small">
                  Not included, no price: {unpriced.map((p) => `${p.ticker} (${formatMoney(p.costBasis)} invested)`).join(', ')}
                </p>
              )}
            </>
          ) : (
            <div className="footer-row">
              <span>
                {positions.length} {positions.length === 1 ? 'position' : 'positions'}
              </span>
              <span>Invested {formatMoney(positions.reduce((sum, p) => sum + p.costBasis, 0))}</span>
            </div>
          )}
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
