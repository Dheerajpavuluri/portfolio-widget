import type { PositionResult } from './pnl.js';
import type { Quote } from './types.js';

export interface Benchmark {
  ticker: string;
  name: string;
}

/**
 * What "the market" means in the strip. Finnhub's free plan does not include
 * the indexes themselves, so these are the funds that track them, and the
 * window labels them with both names.
 */
export const BENCHMARKS: Benchmark[] = [
  { ticker: 'SPY', name: 'S&P 500' },
  { ticker: 'QQQ', name: 'Nasdaq 100' },
];

/** Today's move as a percentage of the previous close. */
export function quoteChangePct(quote: Quote): number {
  return quote.previousClose > 0 ? ((quote.price - quote.previousClose) / quote.previousClose) * 100 : 0;
}

export interface AllocationRow {
  ticker: string;
  marketValue: number;
  /** Share of the priced portfolio's value, 0 to 100. */
  weight: number;
  dayChangePct: number;
  pnl: number;
  pnlPct: number;
}

/** One row per priced position, biggest first, with its share of the total. */
export function allocation(results: PositionResult[]): AllocationRow[] {
  const total = results.reduce((sum, r) => sum + r.marketValue, 0);
  return results
    .map((r) => ({
      ticker: r.position.ticker,
      marketValue: r.marketValue,
      weight: total > 0 ? (r.marketValue / total) * 100 : 0,
      dayChangePct: r.dayChangePct,
      pnl: r.pnl,
      pnlPct: r.pnlPct,
    }))
    .sort((a, b) => b.marketValue - a.marketValue);
}

export interface Extremes {
  best: AllocationRow;
  worst: AllocationRow;
}

/**
 * The best and worst position by a percentage. Percentages, not dollars, so a
 * small position that doubled is not hidden behind a large one that moved a little.
 * Null with fewer than two positions, where "best" and "worst" mean nothing.
 */
export function extremes(rows: AllocationRow[], by: 'dayChangePct' | 'pnlPct'): Extremes | null {
  if (rows.length < 2) return null;
  const sorted = [...rows].sort((a, b) => b[by] - a[by]);
  return { best: sorted[0], worst: sorted[sorted.length - 1] };
}

/**
 * One plain sentence comparing the market with my portfolio, e.g.
 * "The market is up 0.42% today. My portfolio is down 0.61%, 1.03 points behind the S&P 500."
 *
 * `when` is "today" during or after today's session, or something like "on Fri"
 * when the latest prices are from an earlier day.
 */
export function describeDay(marketPct: number | null, portfolioPct: number | null, when: string): string {
  if (marketPct === null) return 'No market prices yet.';

  const market = `The market is ${movement(marketPct, 'dipping')} ${when}.`;
  if (portfolioPct === null) return market;

  const portfolio = `My portfolio is ${movement(portfolioPct, 'down')}`;
  const gap = round2(portfolioPct) - round2(marketPct);
  if (Math.abs(gap) < 0.005) return `${market} ${portfolio}, in line with the S&P 500.`;
  const relation = gap > 0 ? 'ahead of' : 'behind';
  return `${market} ${portfolio}, ${Math.abs(gap).toFixed(2)} points ${relation} the S&P 500.`;
}

function movement(pct: number, downWord: string): string {
  const rounded = round2(pct);
  if (rounded === 0) return 'flat';
  return `${rounded > 0 ? 'up' : downWord} ${Math.abs(rounded).toFixed(2)}%`;
}

// Compare the numbers as they are shown, so the sentence agrees with the strip.
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
