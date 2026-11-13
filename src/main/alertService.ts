import { readFile } from 'node:fs/promises';
import { buildPositions, marketDate, summarizePosition } from '../shared/pnl.js';
import { DEFAULT_ALERTS, type QuoteSnapshot } from '../shared/types.js';
import {
  addDays,
  checkDayMoves,
  checkEarnings,
  checkNews,
  checkTargets,
  EMPTY_MEMORY,
  type AlertMemory,
  type EarningsEvent,
  type Notice,
} from './alerts.js';
import { writeFileAtomic } from './atomicWrite.js';
import type { EventSource } from './finnhub.js';
import type { PortfolioStore } from './store.js';

interface Options {
  store: PortfolioStore;
  /** Null when there is no API key; price alerts still work from the quote snapshots. */
  events: EventSource | null;
  notify: (notice: Notice) => void;
  /** Where the record of what was already announced is kept, so a restart does not repeat alerts. */
  memoryFile: string;
  eventsIntervalMs?: number;
  now?: () => Date;
}

/**
 * Runs the alert checks and shows what they find.
 *
 * Price alerts are checked on every quote refresh. Earnings and news need
 * their own Finnhub calls, so they are checked every 15 minutes: earnings at
 * most once a day per ticker, news only for tickers with news alerts on.
 */
export class AlertService {
  private memory: AlertMemory = EMPTY_MEMORY;
  private earningsCache = new Map<string, { day: string; events: EarningsEvent[] }>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private saving: Promise<void> = Promise.resolve();
  private readonly now: () => Date;

  constructor(private readonly options: Options) {
    this.now = options.now ?? (() => new Date());
  }

  async load(): Promise<void> {
    try {
      this.memory = { ...EMPTY_MEMORY, ...JSON.parse(await readFile(this.options.memoryFile, 'utf8')) };
    } catch {
      // Missing or unreadable: the worst case is an alert being shown once more.
      this.memory = EMPTY_MEMORY;
    }
  }

  start(): void {
    void this.checkEvents();
    this.timer = setInterval(() => void this.checkEvents(), this.options.eventsIntervalMs ?? 15 * 60_000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Called with every new quote snapshot. */
  onQuotes(snapshot: QuoteSnapshot): Promise<void> {
    const settings = this.options.store.alerts();
    const results = buildPositions(this.options.store.list()).flatMap((position) => {
      const quote = snapshot.quotes[position.ticker];
      return quote?.status === 'ok' ? [summarizePosition(position, quote.quote)] : [];
    });

    const moves = checkDayMoves(results, settings, this.memory);
    const targets = checkTargets(results, settings, moves.memory);
    return this.apply([...moves.notices, ...targets.notices], targets.memory);
  }

  async checkEvents(): Promise<void> {
    const { events, store } = this.options;
    if (!events) return;

    const settings = store.alerts();
    const tickers = [...new Set(store.list().map((lot) => lot.ticker))];
    const today = marketDate(this.now().toISOString());
    const want = (ticker: string, key: 'earnings' | 'news') => (settings[ticker] ?? DEFAULT_ALERTS)[key];

    // Earnings dates rarely change, so each ticker's calendar is fetched at most once a day.
    const earnings: EarningsEvent[] = [];
    for (const ticker of tickers.filter((t) => want(t, 'earnings'))) {
      let cached = this.earningsCache.get(ticker);
      if (cached?.day !== today) {
        const fetched = await events.fetchEarnings(ticker, today, addDays(today, 7)).catch(() => null);
        if (fetched) this.earningsCache.set(ticker, (cached = { day: today, events: fetched }));
      }
      earnings.push(...(cached?.events ?? []));
    }

    const newsLists = await Promise.all(
      tickers
        .filter((t) => want(t, 'news'))
        .map((ticker) => events.fetchNews(ticker, addDays(today, -1), today).catch(() => [])),
    );

    const earningsResult = checkEarnings(earnings, settings, this.memory, today);
    const newsResult = checkNews(newsLists.flat(), settings, earningsResult.memory);
    await this.apply([...earningsResult.notices, ...newsResult.notices], newsResult.memory);
  }

  private async apply(notices: Notice[], memory: AlertMemory): Promise<void> {
    this.memory = memory;
    notices.forEach((notice) => this.options.notify(notice));
    // Saved one at a time, so an older save cannot land after a newer one.
    const snapshot = JSON.stringify(memory);
    this.saving = this.saving
      .then(() => writeFileAtomic(this.options.memoryFile, snapshot))
      .catch(() => undefined);
    await this.saving;
  }
}
