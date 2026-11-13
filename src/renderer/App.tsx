import { useEffect, useMemo, useState } from 'react';
import { buildPositions, summarizePortfolio, summarizePosition } from '../shared/pnl';
import { DEFAULT_ALERTS, type AlertSettings, type Lot, type LotInput, type QuoteSnapshot } from '../shared/types';
import { errorMessage, formatMoney } from './format';
import { AskView } from './AskView';
import { LotForm } from './LotForm';
import { MarketStrip } from './MarketStrip';
import { Change, PositionCard } from './PositionCard';
import { StatusBar } from './StatusBar';
import { SummaryView } from './SummaryView';

// What the form panel is doing: closed, adding a new lot, or editing one.
type FormState = { mode: 'closed' } | { mode: 'add' } | { mode: 'edit'; lot: Lot };

type View = 'cards' | 'summary' | 'ask';
const VIEW_KEY = 'portfolio-widget:view';

// The chosen view is only a display preference, so it lives in the window's own
// storage. Reading it can fail in some contexts, and then the app shows cards.
function savedView(): View {
  try {
    const saved = localStorage.getItem(VIEW_KEY);
    return saved === 'summary' || saved === 'ask' ? saved : 'cards';
  } catch {
    return 'cards';
  }
}

const VIEWS: { id: View; label: string }[] = [
  { id: 'cards', label: 'Cards' },
  { id: 'summary', label: 'Summary' },
  { id: 'ask', label: 'Ask' },
];

export function App() {
  const [lots, setLots] = useState<Lot[] | null>(null);
  const [snapshot, setSnapshot] = useState<QuoteSnapshot | null>(null);
  const [form, setForm] = useState<FormState>({ mode: 'closed' });
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>(savedView);
  const [alerts, setAlerts] = useState<Record<string, AlertSettings>>({});

  function chooseView(next: View) {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Not remembered this time; nothing else depends on it.
    }
  }

  useEffect(() => {
    window.portfolio.listLots().then(setLots, (e: unknown) => setError(errorMessage(e)));
    window.portfolio.getAlerts().then(setAlerts, (e: unknown) => setError(errorMessage(e)));
  }, []);

  async function saveAlerts(ticker: string, settings: AlertSettings) {
    try {
      setAlerts(await window.portfolio.setAlerts(ticker, settings));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
      throw e;
    }
  }

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
      setError(errorMessage(e));
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
        <div className="header-actions">
          <div className="toggle" role="group" aria-label="View">
            {VIEWS.map(({ id, label }) => (
              <button key={id} className={view === id ? 'active' : ''} aria-pressed={view === id} onClick={() => chooseView(id)}>
                {label}
              </button>
            ))}
          </div>
          {form.mode === 'closed' && <button onClick={() => setForm({ mode: 'add' })}>Add lot</button>}
        </div>
      </header>

      <StatusBar snapshot={snapshot} />
      <MarketStrip snapshot={snapshot} portfolioPct={results.length > 0 ? total.dayChangePct : null} />

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
        {view === 'summary' && positions.length > 0 && <SummaryView results={results} />}
        {view === 'ask' && <AskView snapshot={snapshot} tickers={positions.map((p) => p.ticker)} />}
        {view === 'cards' &&
          positions.map((position) => (
            <PositionCard
              key={position.ticker}
              position={position}
              quote={snapshot?.quotes[position.ticker]}
              noQuoteText={noQuoteText}
              result={results.find((r) => r.position.ticker === position.ticker) ?? null}
              alerts={alerts[position.ticker] ?? DEFAULT_ALERTS}
              onSaveAlerts={(settings) => saveAlerts(position.ticker, settings)}
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
