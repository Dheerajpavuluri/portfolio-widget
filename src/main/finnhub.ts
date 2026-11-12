import type { MarketStatus, Quote } from '../shared/types.js';

const BASE_URL = 'https://finnhub.io/api/v1';

/** Finnhub's free plan is treated as about 15 minutes behind, and the window says so. */
export const FINNHUB_DELAY_MINUTES = 15;

export type FinnhubErrorKind = 'bad-key' | 'no-access' | 'rate-limit' | 'network' | 'server' | 'bad-response';

export class FinnhubError extends Error {
  constructor(
    readonly kind: FinnhubErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'FinnhubError';
  }
}

/** What the quote service needs from a data source. Tests pass in a fake one. */
export interface QuoteSource {
  /** Returns null when the source has no price for this ticker. */
  fetchQuote(ticker: string): Promise<Quote | null>;
  fetchMarketStatus(): Promise<MarketStatus>;
}

export function createFinnhubClient(apiKey: string, fetchFn: typeof fetch = fetch): QuoteSource {
  async function get(path: string, params: Record<string, string>): Promise<unknown> {
    const url = `${BASE_URL}${path}?${new URLSearchParams(params)}`;

    let response: Response;
    try {
      // The key goes in a header rather than the URL, so it never shows up in
      // logs or error messages that include the address.
      response = await fetchFn(url, {
        headers: { 'X-Finnhub-Token': apiKey },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new FinnhubError('network', 'Could not reach Finnhub. Check the internet connection.');
    }

    if (response.status === 401) throw new FinnhubError('bad-key', 'Finnhub rejected the API key.');
    if (response.status === 403) throw new FinnhubError('no-access', 'Not included in the free Finnhub plan.');
    if (response.status === 429) throw new FinnhubError('rate-limit', 'Finnhub rate limit reached. Will retry.');
    if (!response.ok) throw new FinnhubError('server', `Finnhub returned an error (${response.status}).`);

    try {
      return await response.json();
    } catch {
      throw new FinnhubError('bad-response', 'Finnhub sent a response that could not be read.');
    }
  }

  return {
    async fetchQuote(ticker) {
      return parseQuote(await get('/quote', { symbol: ticker }));
    },
    async fetchMarketStatus() {
      const status = parseMarketStatus(await get('/stock/market-status', { exchange: 'US' }));
      if (!status) throw new FinnhubError('bad-response', 'Finnhub sent a market status that could not be read.');
      return status;
    },
  };
}

/**
 * Reads Finnhub's /quote response: { c: current, pc: previous close, t: unix seconds, ... }.
 * For a ticker it does not know, Finnhub answers with all zeros instead of an
 * error, so a zero or missing price means "no price".
 */
export function parseQuote(json: unknown): Quote | null {
  if (typeof json !== 'object' || json === null) return null;
  const { c, pc, t } = json as Record<string, unknown>;

  if (typeof c !== 'number' || !Number.isFinite(c) || c <= 0) return null;
  if (typeof t !== 'number' || !Number.isFinite(t) || t <= 0) return null;

  return {
    price: c,
    // A brand new listing has no previous close; treat it as unchanged today.
    previousClose: typeof pc === 'number' && pc > 0 ? pc : c,
    asOf: new Date(t * 1000).toISOString(),
  };
}

/** Reads Finnhub's /stock/market-status response: { isOpen, session, holiday, ... }. */
export function parseMarketStatus(json: unknown): MarketStatus | null {
  if (typeof json !== 'object' || json === null) return null;
  const { isOpen, session, holiday } = json as Record<string, unknown>;
  if (typeof isOpen !== 'boolean') return null;

  const knownSessions = ['pre-market', 'regular', 'post-market'] as const;
  return {
    isOpen,
    session: knownSessions.find((s) => s === session) ?? null,
    holiday: typeof holiday === 'string' && holiday.length > 0 ? holiday : null,
    source: 'finnhub',
  };
}
