import type { MarketStatus, QuoteSnapshot } from '../shared/types';
import { formatQuoteTime } from './format';

/** One line under the header saying whether the market is open and how fresh the prices are. */
export function StatusBar({ snapshot, keyFile }: { snapshot: QuoteSnapshot | null; keyFile: string | null }) {
  if (!snapshot) return null;

  if (snapshot.missingKey) {
    return (
      <p className="notice">
        No Finnhub API key found. Add a line <code>FINNHUB_API_KEY=your_key</code> to{' '}
        <code>{keyFile ?? '.env'}</code>, then restart the app.
      </p>
    );
  }

  const { market, error } = snapshot;
  const latest = latestQuoteTime(snapshot);

  return (
    <div className="status">
      <div className="status-line">
        <span className={market?.isOpen ? 'market open' : 'market closed'}>{marketLabel(market)}</span>
        <span className="muted">
          Delayed ~{snapshot.delayMinutes} min
          {latest && <> · {market?.isOpen ? 'as of' : 'last price'} {formatQuoteTime(latest)}</>}
        </span>
      </div>
      {error && (
        <p className="status-error" role="alert">
          {error} {latest && <>Showing prices from {formatQuoteTime(latest)}.</>}
        </p>
      )}
    </div>
  );
}

function marketLabel(market: MarketStatus | null): string {
  if (!market) return 'Checking market...';
  // When Finnhub could not be asked, the status is a guess from trading hours, so say so.
  if (market.source === 'clock') return market.isOpen ? 'Market likely open' : 'Market likely closed';
  if (market.holiday && !market.isOpen) return `Market closed: ${market.holiday}`;
  if (!market.isOpen) return 'Market closed';
  if (market.session === 'pre-market') return 'Pre-market';
  if (market.session === 'post-market') return 'After hours';
  return 'Market open';
}

function latestQuoteTime(snapshot: QuoteSnapshot): string | null {
  let latest: string | null = null;
  for (const result of Object.values(snapshot.quotes)) {
    if (result.status === 'ok' && (!latest || result.quote.asOf > latest)) latest = result.quote.asOf;
  }
  return latest;
}
