import type { PortfolioApi } from '../shared/types';

declare global {
  interface Window {
    /** Exposed by src/preload/preload.ts. */
    portfolio: PortfolioApi;
  }
}
