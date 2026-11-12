import type { Lot, Position, Quote } from './types.js';

// All functions here are pure: same input, same output, no I/O.
// Values keep full precision; rounding to cents happens only when formatting.

export interface LotResult {
  lot: Lot;
  /** (current price - buy price) * shares */
  pnl: number;
  /** pnl as a percentage of what the lot cost. */
  pnlPct: number;
  /** Change since the reference price for today (see dayReferencePrice). */
  dayChange: number;
}

export interface PositionResult {
  position: Position;
  quote: Quote;
  lots: LotResult[];
  marketValue: number;
  /** Sum of the lots' P&L. */
  pnl: number;
  pnlPct: number;
  dayChange: number;
  dayChangePct: number;
}

export interface PortfolioResult {
  costBasis: number;
  marketValue: number;
  pnl: number;
  pnlPct: number;
  dayChange: number;
  dayChangePct: number;
}

export function lotCost(lot: Lot): number {
  return lot.buyPrice * lot.shares;
}

export function lotPnl(lot: Lot, price: number): number {
  return (price - lot.buyPrice) * lot.shares;
}

/** Groups lots by ticker. Positions come back sorted by ticker, lots oldest first. */
export function buildPositions(lots: Lot[]): Position[] {
  const byTicker = new Map<string, Lot[]>();
  for (const lot of lots) {
    const group = byTicker.get(lot.ticker) ?? [];
    group.push(lot);
    byTicker.set(lot.ticker, group);
  }

  return [...byTicker.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ticker, group]) => {
      // Array sort is stable, so same-day lots keep the order they were added in.
      const sorted = [...group].sort((a, b) => a.boughtOn.localeCompare(b.boughtOn));
      const shares = sum(sorted.map((lot) => lot.shares));
      const costBasis = sum(sorted.map(lotCost));
      return {
        ticker,
        lots: sorted,
        shares,
        costBasis,
        avgCost: shares > 0 ? costBasis / shares : 0,
      };
    });
}

/**
 * The price a lot's day change is measured from.
 *
 * Normally that is the previous close. A lot bought on the same trading day
 * as the quote did not exist at yesterday's close, so measuring it from
 * there would invent a gain or loss the user never had. Those lots are
 * measured from their buy price instead.
 */
export function dayReferencePrice(lot: Lot, quote: Quote): number {
  // Both are YYYY-MM-DD, so comparing the strings compares the dates.
  return lot.boughtOn >= marketDate(quote.asOf) ? lot.buyPrice : quote.previousClose;
}

export function summarizePosition(position: Position, quote: Quote): PositionResult {
  const lots = position.lots.map((lot) => {
    const pnl = lotPnl(lot, quote.price);
    return {
      lot,
      pnl,
      pnlPct: percent(pnl, lotCost(lot)),
      dayChange: (quote.price - dayReferencePrice(lot, quote)) * lot.shares,
    };
  });

  const pnl = sum(lots.map((l) => l.pnl));
  const dayChange = sum(lots.map((l) => l.dayChange));
  const referenceValue = sum(position.lots.map((lot) => dayReferencePrice(lot, quote) * lot.shares));

  return {
    position,
    quote,
    lots,
    marketValue: quote.price * position.shares,
    pnl,
    pnlPct: percent(pnl, position.costBasis),
    dayChange,
    dayChangePct: percent(dayChange, referenceValue),
  };
}

/** Totals across every position that has a quote. */
export function summarizePortfolio(results: PositionResult[]): PortfolioResult {
  const costBasis = sum(results.map((r) => r.position.costBasis));
  const marketValue = sum(results.map((r) => r.marketValue));
  const pnl = sum(results.map((r) => r.pnl));
  const dayChange = sum(results.map((r) => r.dayChange));
  // Value at the start of the day is today's value minus today's change.
  const startOfDayValue = marketValue - dayChange;

  return {
    costBasis,
    marketValue,
    pnl,
    pnlPct: percent(pnl, costBasis),
    dayChange,
    dayChangePct: percent(dayChange, startOfDayValue),
  };
}

/**
 * The calendar date in New York for a quote's timestamp, as YYYY-MM-DD.
 * US markets run on New York time, so the trading day a quote belongs to
 * is its date there, wherever the user happens to be.
 */
export function marketDate(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function percent(part: number, whole: number): number {
  return whole === 0 ? 0 : (part / whole) * 100;
}
