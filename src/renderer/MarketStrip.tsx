import { marketDate } from '../shared/pnl';
import { BENCHMARKS, describeDay, quoteChangePct } from '../shared/summary';
import type { QuoteSnapshot } from '../shared/types';
import { direction, formatSignedPercent } from './format';

interface Props {
  snapshot: QuoteSnapshot | null;
  /** Today's move of my priced positions, or null when none have a price. */
  portfolioPct: number | null;
}

const newYorkWeekday = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' });

/** The market's move next to my portfolio's, with one sentence that compares them. */
export function MarketStrip({ snapshot, portfolioPct }: Props) {
  if (!snapshot || snapshot.missingKey) return null;

  const benchmarks = BENCHMARKS.map((b) => {
    const result = snapshot.quotes[b.ticker];
    return { ...b, quote: result?.status === 'ok' ? result.quote : null };
  });
  const sp500 = benchmarks[0].quote;

  // After a weekend or holiday the latest prices are from an earlier session, so say which day.
  const when =
    sp500 && marketDate(sp500.asOf) !== marketDate(new Date().toISOString())
      ? `on ${newYorkWeekday.format(new Date(sp500.asOf))}`
      : 'today';

  return (
    <section className="strip" aria-label="Market">
      <div className="strip-cells">
        {benchmarks.map((b) => (
          <Cell key={b.ticker} label={b.name} detail={b.ticker} pct={b.quote ? quoteChangePct(b.quote) : null} />
        ))}
        <Cell label="My portfolio" detail={when} pct={portfolioPct} />
      </div>
      <p className="strip-sentence muted small">
        {describeDay(sp500 ? quoteChangePct(sp500) : null, portfolioPct, when)}
      </p>
    </section>
  );
}

function Cell({ label, detail, pct }: { label: string; detail: string; pct: number | null }) {
  const d = pct === null ? 'flat' : direction(pct);
  return (
    <div className="strip-cell">
      <span className="small">
        {label} <span className="muted">{detail}</span>
      </span>
      {pct === null ? (
        <span className="muted">-</span>
      ) : (
        <span className={`change ${d}`}>
          {d === 'up' ? '▲' : d === 'down' ? '▼' : '–'} {formatSignedPercent(pct)}
        </span>
      )}
    </div>
  );
}
