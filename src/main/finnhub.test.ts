import { describe, expect, it } from 'vitest';
import { createFinnhubClient, FinnhubError, parseEarnings, parseMarketStatus, parseNews, parseQuote } from './finnhub.js';

describe('parseQuote', () => {
  it('reads price, previous close and time from a Finnhub quote', () => {
    // Shape of a real /quote response.
    const json = { c: 912.5, d: 12.5, dp: 1.3889, h: 915, l: 896.1, o: 900, pc: 900, t: 1794517200 };
    expect(parseQuote(json)).toEqual({
      price: 912.5,
      previousClose: 900,
      asOf: new Date(1794517200 * 1000).toISOString(),
    });
  });

  it('treats the all-zero answer for an unknown ticker as no price', () => {
    expect(parseQuote({ c: 0, d: null, dp: null, h: 0, l: 0, o: 0, pc: 0, t: 0 })).toBeNull();
  });

  it('uses the current price as previous close when there is none', () => {
    expect(parseQuote({ c: 10, pc: 0, t: 1794517200 })?.previousClose).toBe(10);
  });

  it('rejects responses that are not quotes', () => {
    for (const json of [null, 'text', {}, { c: '912' , t: 1 }, { c: 912 }, { c: -1, t: 1 }, { c: Number.NaN, t: 1 }]) {
      expect(parseQuote(json)).toBeNull();
    }
  });
});

describe('parseMarketStatus', () => {
  it('reads an open regular session', () => {
    const json = { exchange: 'US', holiday: null, isOpen: true, session: 'regular', t: 1794517200, timezone: 'America/New_York' };
    expect(parseMarketStatus(json)).toEqual({ isOpen: true, session: 'regular', holiday: null, source: 'finnhub' });
  });

  it('reads a holiday closure', () => {
    const json = { exchange: 'US', holiday: 'Thanksgiving Day', isOpen: false, session: null, t: 1795467600 };
    expect(parseMarketStatus(json)).toEqual({ isOpen: false, session: null, holiday: 'Thanksgiving Day', source: 'finnhub' });
  });

  it('ignores session names it does not know and rejects bad responses', () => {
    expect(parseMarketStatus({ isOpen: false, session: 'something-new' })?.session).toBeNull();
    expect(parseMarketStatus({ session: 'regular' })).toBeNull();
    expect(parseMarketStatus(null)).toBeNull();
  });
});

describe('createFinnhubClient', () => {
  function fakeFetch(status: number, body: unknown) {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const fn = (async (url: string, init?: RequestInit) => {
      calls.push({ url, headers: init?.headers as Record<string, string> });
      return new Response(JSON.stringify(body), { status });
    }) as typeof fetch;
    return { fn, calls };
  }

  it('sends the API key in a header, not in the URL', async () => {
    const { fn, calls } = fakeFetch(200, { c: 900, pc: 920, t: 1794517200 });
    await createFinnhubClient('secret-key', fn).fetchQuote('MU');
    expect(calls[0].url).toBe('https://finnhub.io/api/v1/quote?symbol=MU');
    expect(calls[0].url).not.toContain('secret-key');
    expect(calls[0].headers['X-Finnhub-Token']).toBe('secret-key');
  });

  it('turns HTTP failures into clear error kinds', async () => {
    const cases: [number, string][] = [
      [401, 'bad-key'],
      [403, 'no-access'],
      [429, 'rate-limit'],
      [500, 'server'],
    ];
    for (const [status, kind] of cases) {
      const { fn } = fakeFetch(status, { error: 'x' });
      const error = await createFinnhubClient('k', fn).fetchQuote('MU').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(FinnhubError);
      expect((error as FinnhubError).kind).toBe(kind);
    }
  });

  it('reports a network failure without leaking details', async () => {
    const failing = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    await expect(createFinnhubClient('k', failing).fetchMarketStatus()).rejects.toMatchObject({ kind: 'network' });
  });
});

describe('parseEarnings', () => {
  it('reads dates and timing from the earnings calendar', () => {
    const json = {
      earningsCalendar: [
        { date: '2026-12-17', epsActual: null, epsEstimate: 4.1, hour: 'amc', quarter: 1, symbol: 'MU', year: 2027 },
        { date: '2027-03-25', hour: '', symbol: 'MU' },
      ],
    };
    expect(parseEarnings(json, 'MU')).toEqual([
      { ticker: 'MU', date: '2026-12-17', hour: 'amc' },
      { ticker: 'MU', date: '2027-03-25', hour: null },
    ]);
  });

  it('skips entries for other symbols and anything malformed', () => {
    const json = { earningsCalendar: [{ date: '2026-12-17', symbol: 'AAPL' }, { date: 'soon', symbol: 'MU' }, null] };
    expect(parseEarnings(json, 'MU')).toEqual([]);
    expect(parseEarnings({}, 'MU')).toEqual([]);
    expect(parseEarnings(null, 'MU')).toEqual([]);
  });
});

describe('parseNews', () => {
  it('reads headlines, newest first', () => {
    const json = [
      { category: 'company', datetime: 1794500000, headline: 'Older story', id: 1, source: 'Reuters', url: 'x' },
      { category: 'company', datetime: 1794510000, headline: ' Newer story ', id: 2, source: 'CNBC', url: 'y' },
    ];
    expect(parseNews(json, 'MU')).toEqual([
      { ticker: 'MU', id: 2, headline: 'Newer story', source: 'CNBC' },
      { ticker: 'MU', id: 1, headline: 'Older story', source: 'Reuters' },
    ]);
  });

  it('skips items without an id or headline', () => {
    expect(parseNews([{ id: 1 }, { headline: 'no id' }, { id: 2, headline: '  ' }], 'MU')).toEqual([]);
    expect(parseNews({ error: 'x' }, 'MU')).toEqual([]);
  });
});
