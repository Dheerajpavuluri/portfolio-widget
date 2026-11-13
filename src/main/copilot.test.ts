import { describe, expect, it } from 'vitest';
import { buildPositions, summarizePosition } from '../shared/pnl.js';
import type { Lot, Quote } from '../shared/types.js';
import { buildContext, tickersIn, type PortfolioFacts } from './copilotContext.js';
import { chooseModel, Copilot } from './copilot.js';
import { buildDigest, digestTitle } from './digest.js';

const asOf = '2026-11-12T21:00:00.000Z'; // 4:00 PM New York
const lots: Lot[] = [
  { id: '1', ticker: 'MU', shares: 1, buyPrice: 900, boughtOn: '2026-10-16' },
  { id: '2', ticker: 'MU', shares: 1, buyPrice: 700, boughtOn: '2026-11-05' },
  { id: '3', ticker: 'NFLX', shares: 2, buyPrice: 60, boughtOn: '2026-10-01' },
];
const quotes: Record<string, Quote> = {
  MU: { price: 800, previousClose: 810, asOf },
  NFLX: { price: 63, previousClose: 61, asOf },
};
const facts: PortfolioFacts = {
  results: buildPositions(lots).map((p) => summarizePosition(p, quotes[p.ticker])),
  unpriced: ['WBRBY'],
  sp500Pct: 0.42,
  marketOpen: false,
  asOf,
  delayMinutes: 15,
};

describe('tickersIn', () => {
  it('finds held tickers named as whole words, ignoring case', () => {
    expect(tickersIn('How am I doing on mu?', ['MU', 'NFLX'])).toEqual(['MU']);
    expect(tickersIn('Compare MU and NFLX', ['MU', 'NFLX'])).toEqual(['MU', 'NFLX']);
    expect(tickersIn('What about BRK.B', ['BRK.B'])).toEqual(['BRK.B']);
  });

  it('does not match tickers inside other words', () => {
    expect(tickersIn('How much is my portfolio up?', ['MU', 'UP'])).toEqual(['UP']);
    expect(tickersIn('Any mutual funds?', ['MU'])).toEqual([]);
  });
});

describe('buildContext', () => {
  it('sends only the named position, with its lots, when a ticker is named', () => {
    const { text, tickers } = buildContext('How am I doing on MU?', facts);
    expect(tickers).toEqual(['MU']);
    expect(text).toContain('MU: 2 shares, avg cost $800.00');
    expect(text).toContain('- 1 shares bought 2026-11-05 at $700.00: P&L +$100.00 (+14.29%)');
    expect(text).not.toContain('NFLX');
    expect(text).not.toContain('Portfolio:');
  });

  it('sends a one-line summary of every position for general questions', () => {
    const { text, tickers } = buildContext('What moved most today?', facts);
    expect(tickers).toEqual([]);
    expect(text.split('\n')).toEqual([
      'Prices as of Thu, Nov 12, 4:00 PM New York time, delayed about 15 minutes. Market closed.',
      'S&P 500 (SPY) today: +0.42%.',
      'Portfolio: invested $1,720.00, value $1,726.00, total P&L +$6.00 (+0.35%), today -$16.00 (-0.92%).',
      'Positions:',
      '- MU: 2 shares, avg cost $800.00, invested $1,600.00, price $800.00, value $1,600.00, today -1.23% (-$20.00), total P&L $0.00 (0.00%)',
      '- NFLX: 2 shares, avg cost $60.00, invested $120.00, price $63.00, value $126.00, today +3.28% (+$4.00), total P&L +$6.00 (+5.00%)',
      'No price available: WBRBY.',
    ]);
  });

  it('says when a named ticker has no price', () => {
    expect(buildContext('and WBRBY?', facts).text).toContain('WBRBY: held, but no price is available.');
  });
});

describe('buildDigest', () => {
  const evening = new Date('2026-11-12T22:00:00Z'); // 5 PM New York

  it('summarizes the day from local numbers', () => {
    const digest = buildDigest(facts, [{ ticker: 'MU', date: '2026-11-17', hour: 'amc' }], evening);
    expect(digest).toEqual({
      title: "Today's close",
      lines: [
        'Portfolio value $1,726.00, -$16.00 (-0.92%) today.',
        'The market is up 0.42% today. My portfolio is down 0.92%, 1.34 points behind the S&P 500.',
        'Biggest moves: NFLX +3.28%, MU -1.23%.',
        'Overall: +$6.00 (+0.35%) on $1,720.00 invested.',
        'Earnings this week: MU on Tue, Nov 17 after the close.',
        'No price for WBRBY.',
      ],
    });
  });

  it('describes the last session the next morning', () => {
    const nextMorning = new Date('2026-11-13T12:00:00Z'); // 7 AM New York
    const digest = buildDigest(facts, [], nextMorning);
    expect(digest.title).toBe('Morning digest');
    expect(digest.lines[0]).toBe('Portfolio value $1,726.00, -$16.00 (-0.92%) on Thu, Nov 12.');
  });

  it('has nothing to say without prices', () => {
    expect(buildDigest({ ...facts, results: [] }, [], evening).lines).toEqual([
      'No prices yet, so there is nothing to summarize.',
    ]);
  });
});

describe('digestTitle', () => {
  it('follows the trading day in New York', () => {
    expect(digestTitle(true, new Date('2026-11-12T16:00:00Z'))).toBe('Today so far');
    expect(digestTitle(false, new Date('2026-11-12T13:00:00Z'))).toBe('Morning digest'); // 8 AM
    expect(digestTitle(false, new Date('2026-11-12T22:00:00Z'))).toBe("Today's close");
    expect(digestTitle(false, new Date('2026-11-14T16:00:00Z'))).toBe('Last session'); // Saturday
  });
});

describe('Copilot', () => {
  it('sends the question with only the data it needs, and returns what was sent', async () => {
    const asked: string[] = [];
    const model = {
      label: 'fake',
      where: 'local' as const,
      ask: async (_system: string, question: string) => {
        asked.push(question);
        return 'MU is flat overall.';
      },
    };
    const copilot = new Copilot(model, () => facts);
    const reply = await copilot.ask('How is MU?');

    expect(reply.answer).toBe('MU is flat overall.');
    expect(asked[0]).toBe(`My data:\n${reply.sent}\n\nMy question: How is MU?`);
    expect(reply.sent).not.toContain('NFLX');
  });

  it('uses Ollama unless an Anthropic key is set', () => {
    expect(chooseModel({ anthropicKey: null, anthropicModel: null, ollamaModel: null }).label).toBe(
      'llama3.2 via Ollama on this computer',
    );
    const claude = chooseModel({ anthropicKey: 'sk-test', anthropicModel: null, ollamaModel: 'llama3.2' });
    expect(claude.where).toBe('cloud');
    expect(claude.label).toBe('claude-haiku-5-5 via the Anthropic API');
  });
});
