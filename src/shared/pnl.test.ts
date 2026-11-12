import { describe, expect, it } from 'vitest';
import {
  buildPositions,
  dayReferencePrice,
  lotPnl,
  marketDate,
  summarizePortfolio,
  summarizePosition,
} from './pnl.js';
import type { Lot, Quote } from './types.js';

function lot(id: string, ticker: string, shares: number, buyPrice: number, boughtOn: string): Lot {
  return { id, ticker, shares, buyPrice, boughtOn };
}

// One Micron share bought yesterday at $950 and one bought today at $850.
const micronYesterday = lot('mu-1', 'MU', 1, 950, '2026-11-11');
const micronToday = lot('mu-2', 'MU', 1, 850, '2026-11-12');
const apple = lot('aapl-1', 'AAPL', 10, 200, '2026-10-01');

const micronQuote: Quote = { price: 900, previousClose: 920, asOf: '2026-11-12T20:00:00.000Z' };
const appleQuote: Quote = { price: 210, previousClose: 205, asOf: '2026-11-12T20:00:00.000Z' };

describe('lotPnl', () => {
  it('is (current price - buy price) * shares', () => {
    expect(lotPnl(micronYesterday, 900)).toBe(-50);
    expect(lotPnl(micronToday, 900)).toBe(50);
    expect(lotPnl(apple, 210)).toBe(100);
  });

  it('handles fractional shares', () => {
    expect(lotPnl(lot('x', 'MU', 0.5, 100, '2026-11-01'), 110)).toBeCloseTo(5);
  });
});

describe('buildPositions', () => {
  it('combines lots of the same ticker into one position', () => {
    const [mu] = buildPositions([micronToday, micronYesterday]);
    expect(mu.ticker).toBe('MU');
    expect(mu.shares).toBe(2);
    expect(mu.costBasis).toBe(1800);
    expect(mu.avgCost).toBe(900);
  });

  it('keeps same-day lots in the order they were added', () => {
    const first = lot('a', 'MU', 0.2, 692.84, '2026-11-05');
    const second = lot('b', 'MU', 0.2, 753.87, '2026-11-05');
    expect(buildPositions([second, first])[0].lots.map((l) => l.id)).toEqual(['b', 'a']);
  });

  it('lists lots oldest first and positions by ticker', () => {
    const positions = buildPositions([micronToday, apple, micronYesterday]);
    expect(positions.map((p) => p.ticker)).toEqual(['AAPL', 'MU']);
    expect(positions[1].lots.map((l) => l.id)).toEqual(['mu-1', 'mu-2']);
  });

  it('weights the average cost by shares', () => {
    const [p] = buildPositions([
      lot('a', 'NVDA', 3, 100, '2026-11-01'),
      lot('b', 'NVDA', 1, 200, '2026-11-02'),
    ]);
    // (3 * 100 + 1 * 200) / 4, not (100 + 200) / 2
    expect(p.avgCost).toBe(125);
  });

  it('returns nothing for no lots', () => {
    expect(buildPositions([])).toEqual([]);
  });
});

describe('summarizePosition: two Micron lots ($950 + $850)', () => {
  const [position] = buildPositions([micronYesterday, micronToday]);

  it('reports each lot separately and the combined P&L', () => {
    const result = summarizePosition(position, micronQuote);
    expect(result.lots.map((l) => l.pnl)).toEqual([-50, 50]);
    expect(result.pnl).toBe(0);
    expect(result.marketValue).toBe(1800);
  });

  it('shows a combined gain when the price rises above both buys', () => {
    const result = summarizePosition(position, { ...micronQuote, price: 1000 });
    expect(result.lots.map((l) => l.pnl)).toEqual([50, 150]);
    expect(result.pnl).toBe(200);
    expect(result.pnlPct).toBeCloseTo((200 / 1800) * 100);
  });

  it('shows a combined loss when the price falls below both buys', () => {
    const result = summarizePosition(position, { ...micronQuote, price: 800 });
    expect(result.pnl).toBe(-200);
    expect(result.lots.map((l) => l.pnlPct)).toEqual([(-150 / 950) * 100, (-50 / 850) * 100]);
  });

  it('measures day change from the previous close, except for the lot bought today', () => {
    const result = summarizePosition(position, micronQuote);
    // Yesterday's lot: 900 - 920 (previous close). Today's lot: 900 - 850 (buy price).
    expect(result.lots.map((l) => l.dayChange)).toEqual([-20, 50]);
    expect(result.dayChange).toBe(30);
    expect(result.dayChangePct).toBeCloseTo((30 / 1770) * 100);
  });
});

describe('dayReferencePrice', () => {
  it('uses the previous close for lots bought before today', () => {
    expect(dayReferencePrice(micronYesterday, micronQuote)).toBe(920);
  });

  it('uses the buy price for lots bought today', () => {
    expect(dayReferencePrice(micronToday, micronQuote)).toBe(850);
  });

  it('takes the trading day from the quote in New York time, not UTC', () => {
    // 00:30 UTC on Nov 13 is still 7:30 PM on Nov 12 in New York.
    const eveningQuote = { ...micronQuote, asOf: '2026-11-13T00:30:00.000Z' };
    expect(marketDate(eveningQuote.asOf)).toBe('2026-11-12');
    expect(dayReferencePrice(micronToday, eveningQuote)).toBe(850);
  });
});

describe('summarizePortfolio', () => {
  const positions = buildPositions([micronYesterday, micronToday, apple]);
  const quotes: Record<string, Quote> = { MU: micronQuote, AAPL: appleQuote };
  const results = positions.map((p) => summarizePosition(p, quotes[p.ticker]));

  it('adds up P&L across positions', () => {
    const total = summarizePortfolio(results);
    expect(total.costBasis).toBe(3800);
    expect(total.marketValue).toBe(3900);
    expect(total.pnl).toBe(100); // MU 0 + AAPL 100
    expect(total.pnlPct).toBeCloseTo((100 / 3800) * 100);
  });

  it('adds up day change and measures it against the start-of-day value', () => {
    const total = summarizePortfolio(results);
    expect(total.dayChange).toBe(80); // MU 30 + AAPL 50
    expect(total.dayChangePct).toBeCloseTo((80 / 3820) * 100);
  });

  it('is all zeros for an empty portfolio', () => {
    expect(summarizePortfolio([])).toEqual({
      costBasis: 0,
      marketValue: 0,
      pnl: 0,
      pnlPct: 0,
      dayChange: 0,
      dayChangePct: 0,
    });
  });
});
