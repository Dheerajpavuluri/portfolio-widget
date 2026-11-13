import { useState } from 'react';
import { lotCost, type LotResult, type PositionResult } from '../shared/pnl';
import type { Lot, Position, QuoteResult } from '../shared/types';
import {
  direction,
  formatDate,
  formatMoney,
  formatShares,
  formatSignedMoney,
  formatSignedPercent,
} from './format';

interface Props {
  position: Position;
  /** Undefined until the first price arrives. */
  quote: QuoteResult | undefined;
  /** What to say while there is no quote, e.g. "Waiting for price..." or "No price yet". */
  noQuoteText: string;
  /** Present only when there is a price. */
  result: PositionResult | null;
  onEdit: (lot: Lot) => void;
  onDelete: (lot: Lot) => Promise<void>;
}

export function PositionCard({ position, quote, noQuoteText, result, onEdit, onDelete }: Props) {
  const lotResults = new Map(result?.lots.map((l) => [l.lot.id, l]));

  return (
    <section className="card">
      <header className="card-header">
        <h3>{position.ticker}</h3>
        <PriceSummary quote={quote} noQuoteText={noQuoteText} result={result} />
      </header>

      <dl className="card-stats">
        <div>
          <dt>Shares</dt>
          <dd>{formatShares(position.shares)}</dd>
        </div>
        <div>
          <dt>Avg cost</dt>
          <dd>{formatMoney(position.avgCost)}</dd>
        </div>
        <div>
          <dt>Invested</dt>
          <dd>{formatMoney(position.costBasis)}</dd>
        </div>
        <div>
          <dt>Value now</dt>
          <dd>{result ? formatMoney(result.marketValue) : <span className="muted">-</span>}</dd>
        </div>
        <div className="span-2">
          <dt>Total P&amp;L</dt>
          <dd>{result ? <Change value={result.pnl} percent={result.pnlPct} /> : <span className="muted">-</span>}</dd>
        </div>
      </dl>

      <ul className="lots">
        {position.lots.map((lot) => (
          <LotRow key={lot.id} lot={lot} result={lotResults.get(lot.id)} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </ul>
    </section>
  );
}

/** Current price and today's move, or why there is no price. */
function PriceSummary({ quote, noQuoteText, result }: Pick<Props, 'quote' | 'noQuoteText' | 'result'>) {
  if (!quote) return <span className="muted small">{noQuoteText}</span>;
  if (quote.status === 'unavailable') return <span className="muted small">No price: {quote.reason}</span>;

  const { price, previousClose } = quote.quote;
  const perShare = price - previousClose;
  const percent = previousClose > 0 ? (perShare / previousClose) * 100 : 0;

  return (
    <div className="price">
      <span className="price-now">{formatMoney(price)}</span>
      <span className={`change ${direction(perShare)}`}>
        <Arrow value={perShare} /> {formatSignedMoney(perShare)} ({formatSignedPercent(percent)})
      </span>
      {result && (
        <span className="muted small">
          Today <Change value={result.dayChange} />
        </span>
      )}
    </div>
  );
}

function LotRow({
  lot,
  result,
  onEdit,
  onDelete,
}: { lot: Lot; result: LotResult | undefined } & Pick<Props, 'onEdit' | 'onDelete'>) {
  // Deleting asks for a second click in place, instead of a pop-up dialog.
  const [confirming, setConfirming] = useState(false);

  return (
    // Two lines: what I bought, when, and its P&L; then what I put in and what it is worth now.
    // Edit and Remove sit in their own column to the right.
    <li className="lot">
      <span>
        {formatShares(lot.shares)} @ {formatMoney(lot.buyPrice)}{' '}
        <span className="muted small">{formatDate(lot.boughtOn)}</span>
      </span>
      <span className="lot-number">{result && <Change value={result.pnl} percent={result.pnlPct} />}</span>
      <span className="muted small">Invested {formatMoney(lotCost(lot))}</span>
      <span className="lot-number muted small">{result && <>Now {formatMoney(lotCost(lot) + result.pnl)}</>}</span>
      <div className="lot-actions">
        {confirming ? (
          <>
            <button className="link danger" onClick={() => onDelete(lot)}>
              Delete
            </button>
            <button className="link" onClick={() => setConfirming(false)}>
              Keep
            </button>
          </>
        ) : (
          <>
            <button className="link" onClick={() => onEdit(lot)}>
              Edit
            </button>
            <button className="link" onClick={() => setConfirming(true)}>
              Remove
            </button>
          </>
        )}
      </div>
    </li>
  );
}

/** A signed dollar amount, optionally with a percentage, colored by direction. */
export function Change({ value, percent }: { value: number; percent?: number }) {
  return (
    <span className={`change ${direction(value)}`}>
      {formatSignedMoney(value)}
      {percent !== undefined && <> ({formatSignedPercent(percent)})</>}
    </span>
  );
}

function Arrow({ value }: { value: number }) {
  const d = direction(value);
  // Text arrows rather than color alone, so up and down read the same for everyone.
  return <span aria-label={d}>{d === 'up' ? '▲' : d === 'down' ? '▼' : '–'}</span>;
}
