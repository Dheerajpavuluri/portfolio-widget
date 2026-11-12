import { isRegularTradingHours } from '../shared/marketHours.js';
import type { MarketStatus, QuoteResult, QuoteSnapshot } from '../shared/types.js';
import { FINNHUB_DELAY_MINUTES, FinnhubError, type QuoteSource } from './finnhub.js';

interface Options {
  /** Null when there is no API key. */
  source: QuoteSource | null;
  /** The tickers currently held, read fresh on every refresh. */
  getTickers: () => string[];
  /** Called with the new snapshot after every refresh. */
  publish: (snapshot: QuoteSnapshot) => void;
  intervalMs?: number;
  now?: () => Date;
}

/**
 * Keeps prices up to date and tells the window when they change.
 *
 * Every minute it checks whether the market is open. While it is, every held
 * ticker is re-quoted. While it is closed, prices cannot change, so it only
 * fetches tickers it has no price for yet, plus one last round right after
 * the market closes to pick up the closing prices.
 */
export class QuoteService {
  private snapshot: QuoteSnapshot;
  private timer: ReturnType<typeof setInterval> | null = null;
  private queue: Promise<void> = Promise.resolve();
  private wasOpen = false;
  private readonly intervalMs: number;
  private readonly now: () => Date;

  constructor(private readonly options: Options) {
    this.intervalMs = options.intervalMs ?? 60_000;
    this.now = options.now ?? (() => new Date());
    this.snapshot = {
      market: null,
      quotes: {},
      error: null,
      missingKey: options.source === null,
      delayMinutes: FINNHUB_DELAY_MINUTES,
    };
  }

  start(): void {
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  current(): QuoteSnapshot {
    return this.snapshot;
  }

  /** Call after lots change, so a newly added ticker gets a price right away. */
  tickersChanged(): Promise<void> {
    return this.refresh();
  }

  /** Refreshes run one at a time, so a slow one never overlaps the next. */
  refresh(): Promise<void> {
    this.queue = this.queue.then(() => this.runRefresh()).catch(() => undefined);
    return this.queue;
  }

  private async runRefresh(): Promise<void> {
    const { source, getTickers, publish } = this.options;
    if (!source) {
      publish(this.snapshot);
      return;
    }

    const market = await this.marketStatus(source);
    const tickers = getTickers();
    const justClosed = this.wasOpen && !market.isOpen;
    this.wasOpen = market.isOpen;

    const toFetch =
      market.isOpen || justClosed ? tickers : tickers.filter((ticker) => !(ticker in this.snapshot.quotes));

    const results = await Promise.allSettled(toFetch.map((ticker) => source.fetchQuote(ticker)));

    // Start from the previous prices, so a failed request keeps the last good price on screen.
    const quotes: Record<string, QuoteResult> = {};
    for (const ticker of tickers) {
      if (this.snapshot.quotes[ticker]) quotes[ticker] = this.snapshot.quotes[ticker];
    }

    let error: string | null = null;
    results.forEach((result, i) => {
      const ticker = toFetch[i];
      if (result.status === 'fulfilled') {
        quotes[ticker] = result.value
          ? { status: 'ok', quote: result.value }
          : { status: 'unavailable', reason: 'Finnhub has no price for this ticker.' };
      } else if (result.reason instanceof FinnhubError && result.reason.kind === 'no-access') {
        quotes[ticker] = { status: 'unavailable', reason: result.reason.message };
      } else {
        error ??= result.reason instanceof Error ? result.reason.message : 'Could not refresh prices.';
      }
    });

    this.snapshot = { ...this.snapshot, market, quotes, error };
    publish(this.snapshot);
  }

  private async marketStatus(source: QuoteSource): Promise<MarketStatus> {
    try {
      return await source.fetchMarketStatus();
    } catch {
      // Without Finnhub's answer, fall back to regular trading hours rather than guessing "closed".
      return { isOpen: isRegularTradingHours(this.now()), session: null, holiday: null, source: 'clock' };
    }
  }
}
