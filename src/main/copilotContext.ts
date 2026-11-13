import { buildPositions, summarizePortfolio, summarizePosition, type PositionResult } from '../shared/pnl.js';
import { BENCHMARKS, quoteChangePct } from '../shared/summary.js';
import type { Lot, QuoteSnapshot } from '../shared/types.js';
import { money, pct, signedMoney } from './text.js';

/** Everything the copilot and the digest may draw on, computed from my lots and the latest prices. */
export interface PortfolioFacts {
  results: PositionResult[];
  /** Held tickers with no price. */
  unpriced: string[];
  sp500Pct: number | null;
  marketOpen: boolean | null;
  /** Time of the newest price, ISO. */
  asOf: string | null;
  delayMinutes: number;
}

export function portfolioFacts(lots: Lot[], snapshot: QuoteSnapshot): PortfolioFacts {
  const positions = buildPositions(lots);
  const results: PositionResult[] = [];
  const unpriced: string[] = [];
  for (const position of positions) {
    const quote = snapshot.quotes[position.ticker];
    if (quote?.status === 'ok') results.push(summarizePosition(position, quote.quote));
    else unpriced.push(position.ticker);
  }

  const sp500 = snapshot.quotes[BENCHMARKS[0].ticker];
  const times = Object.values(snapshot.quotes).flatMap((q) => (q.status === 'ok' ? [q.quote.asOf] : []));

  return {
    results,
    unpriced,
    sp500Pct: sp500?.status === 'ok' ? quoteChangePct(sp500.quote) : null,
    marketOpen: snapshot.market?.isOpen ?? null,
    asOf: times.length > 0 ? times.sort().at(-1)! : null,
    delayMinutes: snapshot.delayMinutes,
  };
}

/** Held tickers named in the question, as whole words, ignoring case: "how is mu doing" finds MU. */
export function tickersIn(question: string, held: string[]): string[] {
  return held.filter((ticker) => {
    const escaped = ticker.replace(/[.-]/g, (c) => `\\${c}`);
    return new RegExp(`(^|[^A-Za-z0-9])${escaped}([^A-Za-z0-9]|$)`, 'i').test(question);
  });
}

/**
 * The data sent with one question, as plain text. If the question names
 * tickers I hold, only those positions are sent, with their lots. Otherwise a
 * one-line summary of every position is sent, which is what questions like
 * "what moved most today?" need. Nothing else about me goes with it.
 */
export function buildContext(question: string, facts: PortfolioFacts): { text: string; tickers: string[] } {
  const held = [...facts.results.map((r) => r.position.ticker), ...facts.unpriced];
  const named = tickersIn(question, held);
  const lines: string[] = [];

  lines.push(
    facts.asOf
      ? `Prices as of ${newYorkTime(facts.asOf)} New York time, delayed about ${facts.delayMinutes} minutes. Market ${
          facts.marketOpen ? 'open' : 'closed'
        }.`
      : 'No prices yet.',
  );
  if (facts.sp500Pct !== null) lines.push(`S&P 500 (SPY) today: ${pct(facts.sp500Pct)}.`);

  if (named.length > 0) {
    for (const ticker of named) {
      const result = facts.results.find((r) => r.position.ticker === ticker);
      if (!result) {
        lines.push(`${ticker}: held, but no price is available.`);
        continue;
      }
      lines.push(positionLine(result));
      lines.push('  Lots (each purchase):');
      for (const lot of result.lots) {
        lines.push(
          `  - ${lot.lot.shares} shares bought ${lot.lot.boughtOn} at ${money(lot.lot.buyPrice)}: P&L ${signedMoney(lot.pnl)} (${pct(lot.pnlPct)})`,
        );
      }
    }
  } else {
    const total = summarizePortfolio(facts.results);
    lines.push(
      `Portfolio: invested ${money(total.costBasis)}, value ${money(total.marketValue)}, total P&L ${signedMoney(total.pnl)} (${pct(
        total.pnlPct,
      )}), today ${signedMoney(total.dayChange)} (${pct(total.dayChangePct)}).`,
    );
    lines.push('Positions:');
    facts.results.forEach((r) => lines.push(`- ${positionLine(r)}`));
    if (facts.unpriced.length > 0) lines.push(`No price available: ${facts.unpriced.join(', ')}.`);
  }

  return { text: lines.join('\n'), tickers: named };
}

function positionLine(r: PositionResult): string {
  const p = r.position;
  return `${p.ticker}: ${round(p.shares)} shares, avg cost ${money(p.avgCost)}, invested ${money(p.costBasis)}, price ${money(
    r.quote.price,
  )}, value ${money(r.marketValue)}, today ${pct(r.dayChangePct)} (${signedMoney(r.dayChange)}), total P&L ${signedMoney(r.pnl)} (${pct(
    r.pnlPct,
  )})`;
}

const round = (v: number) => Math.round(v * 1e6) / 1e6;

const newYorkFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const newYorkTime = (iso: string) => newYorkFormat.format(new Date(iso));
