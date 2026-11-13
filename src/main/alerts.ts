import { marketDate, type PositionResult } from '../shared/pnl.js';
import { DEFAULT_ALERTS, type AlertSettings } from '../shared/types.js';
import { signedMoney } from './text.js';

// Deciding when to notify, as pure functions: they take what is known now plus
// what was already announced, and return the notifications to show and the
// updated record. Nothing here talks to Finnhub or the operating system.

export interface Notice {
  ticker: string;
  title: string;
  body: string;
}

export interface EarningsEvent {
  ticker: string;
  /** YYYY-MM-DD */
  date: string;
  /** Before the open, after the close, during market hours, or not given. */
  hour: 'bmo' | 'amc' | 'dmh' | null;
}

export interface NewsItem {
  ticker: string;
  id: number;
  headline: string;
  source: string;
}

/** What has already been announced, so nothing is announced twice. Saved between runs. */
export interface AlertMemory {
  /** Per ticker: the trading day and which directions of the daily move were announced. */
  dayMoves: Record<string, { day: string; up: boolean; down: boolean }>;
  /** Per ticker: whether the gain and loss targets are currently past and announced. */
  targets: Record<string, { gain: boolean; loss: boolean }>;
  /** Earnings already announced, as "TICKER:YYYY-MM-DD". */
  earnings: string[];
  /** News ids already announced, per ticker. */
  news: Record<string, number[]>;
}

export const EMPTY_MEMORY: AlertMemory = { dayMoves: {}, targets: {}, earnings: [], news: {} };

/**
 * A target re-arms only after P&L moves back this many points inside it,
 * so a position sitting right at the line does not notify every minute.
 */
const TARGET_REARM_POINTS = 1;

const NEWS_IDS_KEPT = 200;

const settingsFor = (settings: Record<string, AlertSettings>, ticker: string) => settings[ticker] ?? DEFAULT_ALERTS;

/** Today's move passing the threshold, once per direction per trading day. */
export function checkDayMoves(
  results: PositionResult[],
  settings: Record<string, AlertSettings>,
  memory: AlertMemory,
): { notices: Notice[]; memory: AlertMemory } {
  const notices: Notice[] = [];
  const dayMoves = { ...memory.dayMoves };

  for (const r of results) {
    const ticker = r.position.ticker;
    const threshold = settingsFor(settings, ticker).dayMovePct;
    if (threshold === null) continue;

    const day = marketDate(r.quote.asOf);
    // A new trading day starts with nothing announced.
    const seen = dayMoves[ticker]?.day === day ? { ...dayMoves[ticker] } : { day, up: false, down: false };
    const pct = r.dayChangePct;

    if (pct >= threshold && !seen.up) {
      seen.up = true;
      notices.push(moveNotice(ticker, 'up', pct, r.dayChange, threshold));
    }
    if (pct <= -threshold && !seen.down) {
      seen.down = true;
      notices.push(moveNotice(ticker, 'down', pct, r.dayChange, threshold));
    }
    dayMoves[ticker] = seen;
  }

  return { notices, memory: { ...memory, dayMoves } };
}

function moveNotice(ticker: string, way: 'up' | 'down', pct: number, dollars: number, threshold: number): Notice {
  return {
    ticker,
    title: `${ticker} is ${way} ${Math.abs(pct).toFixed(1)}% today`,
    body: `My position is ${signedMoney(dollars)} today. Alert set at ${threshold}%.`,
  };
}

/**
 * Total P&L reaching my gain or loss target. Announced once when crossed, and
 * re-armed after it moves back at least TARGET_REARM_POINTS inside the target.
 * These report facts; what to do about them is my decision.
 */
export function checkTargets(
  results: PositionResult[],
  settings: Record<string, AlertSettings>,
  memory: AlertMemory,
): { notices: Notice[]; memory: AlertMemory } {
  const notices: Notice[] = [];
  const targets = { ...memory.targets };

  for (const r of results) {
    const ticker = r.position.ticker;
    const { gainPct, lossPct } = settingsFor(settings, ticker);
    const state = { ...(targets[ticker] ?? { gain: false, loss: false }) };
    const pct = r.pnlPct;

    if (gainPct !== null) {
      if (!state.gain && pct >= gainPct) {
        state.gain = true;
        notices.push({
          ticker,
          title: `${ticker} is up ${pct.toFixed(1)}% overall`,
          body: `Total P&L ${signedMoney(r.pnl)}. You set a gain target at ${gainPct}%.`,
        });
      } else if (state.gain && pct < gainPct - TARGET_REARM_POINTS) {
        state.gain = false;
      }
    }

    if (lossPct !== null) {
      if (!state.loss && pct <= -lossPct) {
        state.loss = true;
        notices.push({
          ticker,
          title: `${ticker} is down ${Math.abs(pct).toFixed(1)}% overall`,
          body: `Total P&L ${signedMoney(r.pnl)}. You set a loss limit at ${lossPct}%.`,
        });
      } else if (state.loss && pct > -lossPct + TARGET_REARM_POINTS) {
        state.loss = false;
      }
    }

    targets[ticker] = state;
  }

  return { notices, memory: { ...memory, targets } };
}

/** Earnings today or tomorrow, announced once per event. `today` is YYYY-MM-DD. */
export function checkEarnings(
  events: EarningsEvent[],
  settings: Record<string, AlertSettings>,
  memory: AlertMemory,
  today: string,
): { notices: Notice[]; memory: AlertMemory } {
  const notices: Notice[] = [];
  const announced = new Set(memory.earnings);
  const tomorrow = addDays(today, 1);

  for (const event of events) {
    if (!settingsFor(settings, event.ticker).earnings) continue;
    if (event.date !== today && event.date !== tomorrow) continue;
    const key = `${event.ticker}:${event.date}`;
    if (announced.has(key)) continue;

    announced.add(key);
    const when = event.date === today ? 'today' : 'tomorrow';
    const hour = event.hour === 'bmo' ? ' before the open' : event.hour === 'amc' ? ' after the close' : '';
    notices.push({ ticker: event.ticker, title: `${event.ticker} reports earnings ${when}`, body: `Expected ${when}${hour}.` });
  }

  return { notices, memory: { ...memory, earnings: [...announced] } };
}

/** New headlines for tickers with news alerts on: at most one notice per ticker per check. */
export function checkNews(
  items: NewsItem[],
  settings: Record<string, AlertSettings>,
  memory: AlertMemory,
): { notices: Notice[]; memory: AlertMemory } {
  const notices: Notice[] = [];
  const news = { ...memory.news };

  const byTicker = new Map<string, NewsItem[]>();
  for (const item of items) {
    if (!settingsFor(settings, item.ticker).news) continue;
    byTicker.set(item.ticker, [...(byTicker.get(item.ticker) ?? []), item]);
  }

  for (const [ticker, tickerItems] of byTicker) {
    const seen = new Set(news[ticker] ?? []);
    const fresh = tickerItems.filter((item) => !seen.has(item.id));
    if (fresh.length === 0) continue;

    const more = fresh.length > 1 ? ` (+${fresh.length - 1} more)` : '';
    notices.push({ ticker, title: `${ticker} news${more}`, body: `${fresh[0].headline} (${fresh[0].source})` });
    // Only the most recent ids are kept, so the saved file does not grow forever.
    news[ticker] = [...seen, ...fresh.map((item) => item.id)].slice(-NEWS_IDS_KEPT);
  }

  return { notices, memory: { ...memory, news } };
}

/** Adds days to a YYYY-MM-DD date, using UTC so time zones and daylight saving cannot shift it. */
export function addDays(ymd: string, days: number): string {
  const date = new Date(`${ymd}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
