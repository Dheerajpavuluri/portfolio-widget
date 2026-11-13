/** One purchase of a stock. Positions are built from lots, never stored. */
export interface Lot {
  id: string;
  ticker: string;
  /** Fractional shares are allowed. */
  shares: number;
  /** Price paid per share, in USD. */
  buyPrice: number;
  /** Date of the purchase as YYYY-MM-DD, with no time or time zone. */
  boughtOn: string;
}

/** What the user types in. The id is assigned by the main process. */
export type LotInput = Omit<Lot, 'id'>;

/** All lots for one ticker, plus the totals that come from them. */
export interface Position {
  ticker: string;
  /** Oldest purchase first; lots from the same day stay in the order they were added. */
  lots: Lot[];
  shares: number;
  /** Total amount paid across all lots. */
  costBasis: number;
  /** Cost basis divided by shares, so bigger lots weigh more. */
  avgCost: number;
}

/** The parts of a quote the P&L math needs. */
export interface Quote {
  price: number;
  previousClose: number;
  /** When the price was last updated, ISO 8601. */
  asOf: string;
}

/** Whether US markets are trading right now. */
export interface MarketStatus {
  isOpen: boolean;
  session: 'pre-market' | 'regular' | 'post-market' | null;
  /** Name of today's holiday, when the market is closed for one. */
  holiday: string | null;
  /** 'clock' means Finnhub could not be asked, so this is a guess from regular trading hours. */
  source: 'finnhub' | 'clock';
}

/** A price for one ticker, or the reason there is none. */
export type QuoteResult = { status: 'ok'; quote: Quote } | { status: 'unavailable'; reason: string };

/** Everything the window needs to show prices. Sent by the main process after every refresh. */
export interface QuoteSnapshot {
  market: MarketStatus | null;
  quotes: Record<string, QuoteResult>;
  /** What went wrong on the latest refresh, if anything. Prices from earlier refreshes are kept. */
  error: string | null;
  /** True when no Finnhub API key was found. */
  missingKey: boolean;
  /** How far behind real time the prices are, so the window can say so. */
  delayMinutes: number;
}

/**
 * Which notifications I want for one ticker. Percentages are positive numbers;
 * null means that alert is off.
 */
export interface AlertSettings {
  /** Today's move for the position, either way, e.g. 3 for "more than 3% up or down". */
  dayMovePct: number | null;
  /** Total P&L reaching this gain, e.g. 20 for "+20% overall". */
  gainPct: number | null;
  /** Total P&L reaching this loss, e.g. 10 for "-10% overall". */
  lossPct: number | null;
  /** Earnings coming up within a day. */
  earnings: boolean;
  /** New company news headlines. */
  news: boolean;
}

/** What a ticker gets before I change anything: earnings only, which is rare and useful. */
export const DEFAULT_ALERTS: AlertSettings = {
  dayMovePct: null,
  gainPct: null,
  lossPct: null,
  earnings: true,
  news: false,
};

/** The shape of the data file on disk. */
export interface StoredData {
  /** Bumped when the shape changes, so old files can be migrated (see src/main/migrate.ts). */
  version: 3;
  lots: Lot[];
  /** Keyed by ticker. A ticker with no entry uses DEFAULT_ALERTS. */
  alerts: Record<string, AlertSettings>;
}

/** Every IPC channel the renderer may call. Main and preload both type-check against this. */
export type IpcChannel =
  | 'lots:list'
  | 'lots:add'
  | 'lots:update'
  | 'lots:delete'
  | 'quotes:get'
  | 'alerts:get'
  | 'alerts:set';

/** Messages the main process pushes to the renderer without being asked. */
export type IpcEvent = 'quotes:updated';

/** The calls the renderer can make. Implemented in the preload script. */
export interface PortfolioApi {
  listLots(): Promise<Lot[]>;
  addLot(input: LotInput): Promise<Lot[]>;
  updateLot(id: string, input: LotInput): Promise<Lot[]>;
  deleteLot(id: string): Promise<Lot[]>;
  getQuotes(): Promise<QuoteSnapshot>;
  /** Alert settings for every ticker that has some; others use DEFAULT_ALERTS. */
  getAlerts(): Promise<Record<string, AlertSettings>>;
  setAlerts(ticker: string, settings: AlertSettings): Promise<Record<string, AlertSettings>>;
  /** Calls the listener after every price refresh. Returns a function that stops listening. */
  onQuotes(listener: (snapshot: QuoteSnapshot) => void): () => void;
}
