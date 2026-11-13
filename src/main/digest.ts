import { marketDate, summarizePortfolio } from '../shared/pnl.js';
import { describeDay } from '../shared/summary.js';
import type { Digest } from '../shared/types.js';
import { addDays, type EarningsEvent } from './alerts.js';
import type { PortfolioFacts } from './copilotContext.js';
import { money, pct, signedMoney } from './text.js';

const newYorkClock = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'short',
  hour: 'numeric',
  minute: 'numeric',
  hourCycle: 'h23',
});

const weekdayDate = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

/**
 * A few lines about how my portfolio is doing, built from my own numbers on
 * this machine. No model is involved, so nothing is sent anywhere.
 */
export function buildDigest(facts: PortfolioFacts, earnings: EarningsEvent[], now: Date): Digest {
  const title = digestTitle(facts.marketOpen, now);
  if (facts.results.length === 0) {
    return { title, lines: ['No prices yet, so there is nothing to summarize.'] };
  }

  const total = summarizePortfolio(facts.results);
  const today = marketDate(now.toISOString());
  const when = facts.asOf && marketDate(facts.asOf) !== today ? `on ${weekday(marketDate(facts.asOf))}` : 'today';
  const lines: string[] = [];

  lines.push(`Portfolio value ${money(total.marketValue)}, ${signedMoney(total.dayChange)} (${pct(total.dayChangePct)}) ${when}.`);
  lines.push(describeDay(facts.sp500Pct, total.dayChangePct, when));

  const movers = [...facts.results]
    .sort((a, b) => Math.abs(b.dayChangePct) - Math.abs(a.dayChangePct))
    .slice(0, 2)
    .map((r) => `${r.position.ticker} ${pct(r.dayChangePct)}`);
  lines.push(`Biggest moves: ${movers.join(', ')}.`);

  lines.push(`Overall: ${signedMoney(total.pnl)} (${pct(total.pnlPct)}) on ${money(total.costBasis)} invested.`);

  const soon = earnings
    .filter((e) => e.date >= today && e.date <= addDays(today, 7))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => `${e.ticker} on ${weekday(e.date)}${e.hour === 'amc' ? ' after the close' : e.hour === 'bmo' ? ' before the open' : ''}`);
  if (soon.length > 0) lines.push(`Earnings this week: ${soon.join(', ')}.`);

  if (facts.unpriced.length > 0) lines.push(`No price for ${facts.unpriced.join(', ')}.`);

  return { title, lines };
}

/** "Morning digest" before the open, "Today so far" while trading, "Today's close" after. */
export function digestTitle(marketOpen: boolean | null, now: Date): string {
  if (marketOpen) return 'Today so far';
  const parts = newYorkClock.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  if (get('weekday') === 'Sat' || get('weekday') === 'Sun') return 'Last session';
  const minutes = Number(get('hour')) * 60 + Number(get('minute'));
  return minutes < 9 * 60 + 30 ? 'Morning digest' : "Today's close";
}

/** "2026-12-17" -> "Thu Dec 17", read as a calendar date so no time zone can shift it. */
function weekday(ymd: string): string {
  return weekdayDate.format(new Date(`${ymd}T12:00:00Z`));
}
