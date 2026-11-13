import { describe, expect, it } from 'vitest';
import { buildPositions, summarizePosition } from '../shared/pnl.js';
import { DEFAULT_ALERTS, type AlertSettings, type Lot, type Quote } from '../shared/types.js';
import { addDays, checkDayMoves, checkEarnings, checkNews, checkTargets, EMPTY_MEMORY } from './alerts.js';

const lots: Lot[] = [{ id: '1', ticker: 'MU', shares: 2, buyPrice: 800, boughtOn: '2026-10-01' }];
const [position] = buildPositions(lots);

/** A Micron result at `price`, with yesterday's close at 900, on the given day. */
function micron(price: number, day = '2026-11-12') {
  const quote: Quote = { price, previousClose: 900, asOf: `${day}T20:00:00.000Z` };
  return [summarizePosition(position, quote)];
}

const settings = (s: Partial<AlertSettings>) => ({ MU: { ...DEFAULT_ALERTS, ...s } });

describe('checkDayMoves', () => {
  const threePct = settings({ dayMovePct: 3 });

  it('stays quiet inside the threshold', () => {
    expect(checkDayMoves(micron(920), threePct, EMPTY_MEMORY).notices).toEqual([]); // +2.2%
  });

  it('announces a move past the threshold once, then stays quiet the rest of the day', () => {
    const first = checkDayMoves(micron(930), threePct, EMPTY_MEMORY); // +3.33%
    expect(first.notices).toEqual([
      { ticker: 'MU', title: 'MU is up 3.3% today', body: 'My position is +$60.00 today. Alert set at 3%.' },
    ]);
    const later = checkDayMoves(micron(940), threePct, first.memory);
    expect(later.notices).toEqual([]);
  });

  it('announces the other direction separately on the same day', () => {
    const up = checkDayMoves(micron(930), threePct, EMPTY_MEMORY);
    const down = checkDayMoves(micron(870), threePct, up.memory); // -3.33%
    expect(down.notices.map((n) => n.title)).toEqual(['MU is down 3.3% today']);
  });

  it('starts fresh on the next trading day', () => {
    const today = checkDayMoves(micron(930), threePct, EMPTY_MEMORY);
    const tomorrow = checkDayMoves(micron(930, '2026-11-13'), threePct, today.memory);
    expect(tomorrow.notices).toHaveLength(1);
  });

  it('does nothing when the alert is off', () => {
    expect(checkDayMoves(micron(990), settings({ dayMovePct: null }), EMPTY_MEMORY).notices).toEqual([]);
    expect(checkDayMoves(micron(990), {}, EMPTY_MEMORY).notices).toEqual([]); // defaults: off
  });
});

describe('checkTargets', () => {
  // Bought 2 shares at $800, so +20% is $960 and -10% is $720.
  const targets = settings({ gainPct: 20, lossPct: 10 });

  it('announces the gain target once when it is reached', () => {
    const first = checkTargets(micron(965), targets, EMPTY_MEMORY); // +20.6%
    expect(first.notices).toEqual([
      { ticker: 'MU', title: 'MU is up 20.6% overall', body: 'Total P&L +$330.00. You set a gain target at 20%.' },
    ]);
    expect(checkTargets(micron(970), targets, first.memory).notices).toEqual([]);
  });

  it('re-arms only after moving back at least a point inside the target', () => {
    const first = checkTargets(micron(965), targets, EMPTY_MEMORY);
    const dip = checkTargets(micron(956), targets, first.memory); // +19.5%: not far enough back
    expect(checkTargets(micron(965), targets, dip.memory).notices).toEqual([]);

    const realDip = checkTargets(micron(950), targets, first.memory); // +18.75%: re-armed
    expect(checkTargets(micron(965), targets, realDip.memory).notices).toHaveLength(1);
  });

  it('announces the loss limit', () => {
    const result = checkTargets(micron(715), targets, EMPTY_MEMORY); // -10.6%
    expect(result.notices.map((n) => n.title)).toEqual(['MU is down 10.6% overall']);
    expect(result.notices[0].body).toBe('Total P&L -$170.00. You set a loss limit at 10%.');
  });
});

describe('checkEarnings', () => {
  const event = { ticker: 'MU', date: '2026-11-13', hour: 'amc' as const };

  it('announces earnings tomorrow, once', () => {
    const first = checkEarnings([event], {}, EMPTY_MEMORY, '2026-11-12'); // earnings are on by default
    expect(first.notices).toEqual([
      { ticker: 'MU', title: 'MU reports earnings tomorrow', body: 'Expected tomorrow after the close.' },
    ]);
    expect(checkEarnings([event], {}, first.memory, '2026-11-12').notices).toEqual([]);
  });

  it('ignores earnings further out, and tickers with earnings alerts off', () => {
    expect(checkEarnings([event], {}, EMPTY_MEMORY, '2026-11-10').notices).toEqual([]);
    expect(checkEarnings([event], settings({ earnings: false }), EMPTY_MEMORY, '2026-11-12').notices).toEqual([]);
  });
});

describe('checkNews', () => {
  const items = [
    { ticker: 'MU', id: 2, headline: 'Micron raises guidance', source: 'Reuters' },
    { ticker: 'MU', id: 1, headline: 'Memory prices climb', source: 'Bloomberg' },
  ];

  it('is off by default', () => {
    expect(checkNews(items, {}, EMPTY_MEMORY).notices).toEqual([]);
  });

  it('sends one notice per ticker for new headlines, and none for headlines already seen', () => {
    const on = settings({ news: true });
    const first = checkNews(items, on, EMPTY_MEMORY);
    expect(first.notices).toEqual([{ ticker: 'MU', title: 'MU news (+1 more)', body: 'Micron raises guidance (Reuters)' }]);

    expect(checkNews(items, on, first.memory).notices).toEqual([]);
    const newer = [{ ticker: 'MU', id: 3, headline: 'Analyst upgrade', source: 'CNBC' }, ...items];
    expect(checkNews(newer, on, first.memory).notices.map((n) => n.title)).toEqual(['MU news']);
  });
});

describe('addDays', () => {
  it('crosses month ends and daylight saving changes', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
  });
});
