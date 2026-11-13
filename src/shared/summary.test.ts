import { describe, expect, it } from 'vitest';
import { buildPositions, summarizePosition } from './pnl.js';
import { allocation, describeDay, extremes, quoteChangePct } from './summary.js';
import type { Lot, Quote } from './types.js';

const asOf = '2026-11-12T20:00:00.000Z';
const lots: Lot[] = [
  { id: '1', ticker: 'MU', shares: 2, buyPrice: 900, boughtOn: '2026-10-01' },
  { id: '2', ticker: 'NFLX', shares: 10, buyPrice: 60, boughtOn: '2026-10-01' },
  { id: '3', ticker: 'CRWV', shares: 1, buyPrice: 50, boughtOn: '2026-10-01' },
];
const quotes: Record<string, Quote> = {
  MU: { price: 950, previousClose: 1000, asOf }, // value 1900, -5% today, +5.56% overall
  NFLX: { price: 70, previousClose: 68, asOf }, // value 700, +2.94% today, +16.67% overall
  CRWV: { price: 100, previousClose: 101, asOf }, // value 100, -0.99% today, +100% overall
};
const results = buildPositions(lots).map((p) => summarizePosition(p, quotes[p.ticker]));

describe('quoteChangePct', () => {
  it('is the move from the previous close', () => {
    expect(quoteChangePct({ price: 505, previousClose: 500, asOf })).toBeCloseTo(1);
    expect(quoteChangePct({ price: 10, previousClose: 0, asOf })).toBe(0);
  });
});

describe('allocation', () => {
  it('lists positions biggest first with their share of the total', () => {
    const rows = allocation(results);
    expect(rows.map((r) => r.ticker)).toEqual(['MU', 'NFLX', 'CRWV']);
    expect(rows.map((r) => r.weight)).toEqual([(1900 / 2700) * 100, (700 / 2700) * 100, (100 / 2700) * 100]);
    expect(rows.reduce((sum, r) => sum + r.weight, 0)).toBeCloseTo(100);
  });

  it('is empty for no priced positions', () => {
    expect(allocation([])).toEqual([]);
  });
});

describe('extremes', () => {
  const rows = allocation(results);

  it('picks the best and worst mover today by percentage', () => {
    const today = extremes(rows, 'dayChangePct');
    expect(today?.best.ticker).toBe('NFLX');
    expect(today?.worst.ticker).toBe('MU');
  });

  it('uses percentages overall, so a small position that doubled still shows', () => {
    const overall = extremes(rows, 'pnlPct');
    expect(overall?.best.ticker).toBe('CRWV'); // +$50 but +100%
    expect(overall?.worst.ticker).toBe('MU'); // +$100 but only +5.56%
  });

  it('needs at least two positions', () => {
    expect(extremes(rows.slice(0, 1), 'pnlPct')).toBeNull();
  });
});

describe('describeDay', () => {
  it('compares the portfolio with the market', () => {
    expect(describeDay(0.42, -0.61, 'today')).toBe(
      'The market is up 0.42% today. My portfolio is down 0.61%, 1.03 points behind the S&P 500.',
    );
    expect(describeDay(-1.2, 0.3, 'today')).toBe(
      'The market is dipping 1.20% today. My portfolio is up 0.30%, 1.50 points ahead of the S&P 500.',
    );
  });

  it('handles flat days and matching moves', () => {
    expect(describeDay(0.001, 0.5, 'today')).toBe(
      'The market is flat today. My portfolio is up 0.50%, 0.50 points ahead of the S&P 500.',
    );
    expect(describeDay(0.5, 0.501, 'on Fri')).toBe(
      'The market is up 0.50% on Fri. My portfolio is up 0.50%, in line with the S&P 500.',
    );
  });

  it('works with only market data, or none', () => {
    expect(describeDay(0.42, null, 'today')).toBe('The market is up 0.42% today.');
    expect(describeDay(null, 1, 'today')).toBe('No market prices yet.');
  });
});
