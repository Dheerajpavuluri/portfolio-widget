import { describe, expect, it } from 'vitest';
import { validateLot } from './validateLot.js';

// Built from local parts so "today" is Nov 12 in any time zone the tests run in.
const now = new Date(2026, 10, 12, 12, 0);
const good = { ticker: 'mu', shares: 1, buyPrice: 850, boughtOn: '2026-11-12' };

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

  it('accepts a purchase made today', () => {
    expect(validateLot({ ...good, boughtOn: '2026-11-12' }, now).ok).toBe(true);
  });

  it('rejects missing, malformed, impossible and future dates', () => {
    for (const boughtOn of [undefined, '', 'not a date', '11/05/2026', '2026-11-05T10:00', '2026-02-30', '2026-11-13']) {
      const result = validateLot({ ...good, boughtOn }, now);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.boughtOn).toBeDefined();
    }
  });

  it('rejects input that is not an object', () => {
    expect(validateLot(null, now).ok).toBe(false);
    expect(validateLot('MU', now).ok).toBe(false);
  });
});
