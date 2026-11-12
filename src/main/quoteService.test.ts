import { describe, expect, it } from 'vitest';
import type { MarketStatus, Quote, QuoteSnapshot } from '../shared/types.js';
import { FinnhubError, type QuoteSource } from './finnhub.js';
import { QuoteService } from './quoteService.js';

const open: MarketStatus = { isOpen: true, session: 'regular', holiday: null, source: 'finnhub' };
const closed: MarketStatus = { isOpen: false, session: null, holiday: null, source: 'finnhub' };

function quote(price: number): Quote {
  return { price, previousClose: 100, asOf: '2026-11-12T20:00:00.000Z' };
}

/** A data source whose answers each test controls, and which records what was asked. */
function fakeSource() {
  const state = {
    market: open as MarketStatus | Error,
    prices: {} as Record<string, number | null | Error>,
    requested: [] as string[],
  };
  const source: QuoteSource = {
    async fetchMarketStatus() {
      if (state.market instanceof Error) throw state.market;
      return state.market;
    },
    async fetchQuote(ticker) {
      state.requested.push(ticker);
      const price = state.prices[ticker];
      if (price instanceof Error) throw price;
      return price == null ? null : quote(price);
    },
  };
  return { source, state };
}

function setup(tickers: string[]) {
  const fake = fakeSource();
  const published: QuoteSnapshot[] = [];
  const service = new QuoteService({
    source: fake.source,
    getTickers: () => tickers,
    publish: (snapshot) => published.push(snapshot),
  });
  return { ...fake, service, published, tickers };
}

describe('QuoteService', () => {
  it('fetches every held ticker while the market is open', async () => {
    const { service, state } = setup(['MU', 'NFLX']);
    state.prices = { MU: 900, NFLX: 70 };
    await service.refresh();
    await service.refresh();

    expect(state.requested).toEqual(['MU', 'NFLX', 'MU', 'NFLX']);
    expect(service.current().quotes.MU).toEqual({ status: 'ok', quote: quote(900) });
    expect(service.current().market).toEqual(open);
  });

  it('stops re-fetching while the market is closed, after one last round at the close', async () => {
    const { service, state } = setup(['MU']);
    state.prices = { MU: 900 };
    await service.refresh(); // open
    state.market = closed;
    await service.refresh(); // just closed: picks up the closing price
    await service.refresh(); // still closed: nothing to fetch
    await service.refresh();

    expect(state.requested).toEqual(['MU', 'MU']);
  });

  it('fetches a newly added ticker right away, even when the market is closed', async () => {
    const { service, state, tickers } = setup(['MU']);
    state.market = closed;
    state.prices = { MU: 900, CRWV: 56 };
    await service.refresh();

    tickers.push('CRWV');
    await service.tickersChanged();

    expect(state.requested).toEqual(['MU', 'CRWV']);
    expect(service.current().quotes.CRWV?.status).toBe('ok');
  });

  it('marks tickers with no price as unavailable instead of showing zero', async () => {
    const { service, state } = setup(['WBRBY', 'XYZ']);
    state.prices = { WBRBY: new FinnhubError('no-access', 'Not included in the free Finnhub plan.'), XYZ: null };
    await service.refresh();

    expect(service.current().quotes).toEqual({
      WBRBY: { status: 'unavailable', reason: 'Not included in the free Finnhub plan.' },
      XYZ: { status: 'unavailable', reason: 'Finnhub has no price for this ticker.' },
    });
    expect(service.current().error).toBeNull();
  });

  it('keeps the last good price and reports the problem when a refresh fails', async () => {
    const { service, state } = setup(['MU']);
    state.prices = { MU: 900 };
    await service.refresh();

    state.prices = { MU: new FinnhubError('network', 'Could not reach Finnhub.') };
    await service.refresh();

    expect(service.current().quotes.MU).toEqual({ status: 'ok', quote: quote(900) });
    expect(service.current().error).toBe('Could not reach Finnhub.');

    state.prices = { MU: 905 };
    await service.refresh();
    expect(service.current().error).toBeNull();
  });

  it('drops prices for tickers that are no longer held', async () => {
    const { service, state, tickers } = setup(['MU', 'NFLX']);
    state.prices = { MU: 900, NFLX: 70 };
    await service.refresh();

    tickers.splice(tickers.indexOf('NFLX'), 1);
    await service.tickersChanged();
    expect(Object.keys(service.current().quotes)).toEqual(['MU']);
  });

  it('falls back to trading hours when the market status cannot be fetched', async () => {
    const fake = fakeSource();
    fake.state.market = new FinnhubError('no-access', 'no');
    const service = new QuoteService({
      source: fake.source,
      getTickers: () => [],
      publish: () => undefined,
      now: () => new Date('2026-11-14T16:00:00Z'), // a Saturday
    });
    await service.refresh();
    expect(service.current().market).toEqual({ isOpen: false, session: null, holiday: null, source: 'clock' });
  });

  it('says the key is missing and makes no requests without one', async () => {
    const published: QuoteSnapshot[] = [];
    const service = new QuoteService({ source: null, getTickers: () => ['MU'], publish: (s) => published.push(s) });
    await service.refresh();
    expect(published[0].missingKey).toBe(true);
    expect(published[0].quotes).toEqual({});
  });

  it('labels prices with the data delay', () => {
    const { service } = setup([]);
    expect(service.current().delayMinutes).toBe(15);
  });
});
