import { describe, expect, it } from 'vitest';
import { validateLot } from './validateLot.js';

const now = new Date('2026-11-12T20:00:00.000Z');
const good = { ticker: 'mu', shares: 1, buyPrice: 850, boughtAt: '2026-11-12T17:00:00.000Z' };

describe('validateLot', () => {
  it('accepts a valid lot and upper-cases the ticker', () => {
    const result = validateLot(good, now);
    expect(result).toEqual({ ok: true, value: { ...good, ticker: 'MU' } });
  });

  it('accepts tickers with a class suffix and fractional shares', () => {
    const result = validateLot({ ...good, ticker: 'BRK.B', shares: 0.25 }, now);
    expect(result.ok).toBe(true);
  });

  it('rejects zero, negative and non-numeric shares and prices', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, '5']) {
      const result = validateLot({ ...good, shares: bad, buyPrice: bad }, now);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.shares).toBeDefined();
        expect(result.errors.buyPrice).toBeDefined();
      }
    }
  });

  it('rejects bad tickers', () => {
    for (const ticker of ['', '1ABC', 'TOOLONGTICKER', 'MU$', 42]) {
      expect(validateLot({ ...good, ticker }, now).ok).toBe(false);
    }
  });

  it('rejects missing, invalid and future purchase times', () => {
    for (const boughtAt of [undefined, 'not a date', '2026-11-13T20:00:00.000Z']) {
      const result = validateLot({ ...good, boughtAt }, now);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.boughtAt).toBeDefined();
    }
  });

  it('rejects input that is not an object', () => {
    expect(validateLot(null, now).ok).toBe(false);
    expect(validateLot('MU', now).ok).toBe(false);
  });
});
