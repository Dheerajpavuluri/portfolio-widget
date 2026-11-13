import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { QuoteSnapshot } from '../shared/types.js';
import type { Notice } from './alerts.js';
import { AlertService } from './alertService.js';
import type { EventSource } from './finnhub.js';
import { PortfolioStore } from './store.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'portfolio-widget-alerts-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function setup(events: EventSource | null = null) {
  const store = new PortfolioStore(join(dir, 'portfolio.json'));
  await store.load();
  await store.add({ ticker: 'MU', shares: 1, buyPrice: 800, boughtOn: '2026-10-01' });
  await store.setAlerts('MU', { dayMovePct: 3, gainPct: null, lossPct: null, earnings: true, news: true });

  const shown: Notice[] = [];
  const make = () =>
    new AlertService({
      store,
      events,
      notify: (n) => shown.push(n),
      memoryFile: join(dir, 'alert-memory.json'),
      now: () => new Date('2026-11-12T18:00:00Z'),
    });
  return { store, shown, make };
}

const snapshot = (price: number): QuoteSnapshot => ({
  market: { isOpen: true, session: 'regular', holiday: null, source: 'finnhub' },
  quotes: { MU: { status: 'ok', quote: { price, previousClose: 900, asOf: '2026-11-12T18:00:00.000Z' } } },
  error: null,
  missingKey: false,
  delayMinutes: 15,
});

describe('AlertService', () => {
  it('notifies on a price move and does not repeat it after a restart', async () => {
    const { shown, make } = await setup();
    const first = make();
    await first.load();
    await first.onQuotes(snapshot(930));
    expect(shown.map((n) => n.title)).toEqual(['MU is up 3.3% today']);

    const afterRestart = make();
    await afterRestart.load();
    await afterRestart.onQuotes(snapshot(935));
    expect(shown).toHaveLength(1);
  });

  it('fetches earnings once a day and news on every check', async () => {
    const calls: string[] = [];
    const events: EventSource = {
      async fetchEarnings(ticker, from, to) {
        calls.push(`earnings ${ticker} ${from}..${to}`);
        return [{ ticker, date: '2026-11-13', hour: 'amc' }];
      },
      async fetchNews(ticker, from, to) {
        calls.push(`news ${ticker} ${from}..${to}`);
        return [{ ticker, id: 7, headline: 'Micron raises guidance', source: 'Reuters' }];
      },
    };
    const { shown, make } = await setup(events);
    const service = make();
    await service.load();
    await service.checkEvents();
    await service.checkEvents();

    expect(calls).toEqual([
      'earnings MU 2026-11-12..2026-11-19',
      'news MU 2026-11-11..2026-11-12',
      'news MU 2026-11-11..2026-11-12',
    ]);
    expect(shown.map((n) => n.title)).toEqual(['MU reports earnings tomorrow', 'MU news']);
  });

  it('keeps working when Finnhub calls fail', async () => {
    const failing: EventSource = {
      fetchEarnings: async () => {
        throw new Error('offline');
      },
      fetchNews: async () => {
        throw new Error('offline');
      },
    };
    const { shown, make } = await setup(failing);
    const service = make();
    await service.load();
    await expect(service.checkEvents()).resolves.toBeUndefined();
    expect(shown).toEqual([]);
  });
});
