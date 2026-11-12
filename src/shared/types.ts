/** One purchase of a stock. Positions are built from lots, never stored. */
export interface Lot {
  id: string;
  ticker: string;
  /** Fractional shares are allowed. */
  shares: number;
  /** Price paid per share, in USD. */
  buyPrice: number;
  /** ISO 8601 timestamp of the purchase. */
  boughtAt: string;
}

/** What the user types in. The id is assigned by the main process. */
export type LotInput = Omit<Lot, 'id'>;

/** All lots for one ticker, plus the totals that come from them. */
export interface Position {
  ticker: string;
  /** Oldest purchase first. */
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

/** The shape of the data file on disk. */
export interface StoredData {
  /** Bumped when the shape changes, so old files can be migrated. */
  version: 1;
  lots: Lot[];
}

/** Every IPC channel the renderer may call. Main and preload both type-check against this. */
export type IpcChannel = 'lots:list' | 'lots:add' | 'lots:update' | 'lots:delete';

/** The calls the renderer can make. Implemented in the preload script. */
export interface PortfolioApi {
  listLots(): Promise<Lot[]>;
  addLot(input: LotInput): Promise<Lot[]>;
  updateLot(id: string, input: LotInput): Promise<Lot[]>;
  deleteLot(id: string): Promise<Lot[]>;
}
