import { isCalendarDate, localDate } from './dates.js';
import type { LotInput } from './types.js';

export type LotField = keyof LotInput;

export type ValidationResult =
  | { ok: true; value: LotInput }
  | { ok: false; errors: Partial<Record<LotField, string>> };

// Letters first, then letters, digits, dots or dashes (BRK.B, BF-B). Up to 10 characters.
const TICKER_PATTERN = /^[A-Z][A-Z0-9.-]{0,9}$/;

/**
 * Checks a lot before it is saved. The form uses this to show errors, and the
 * main process runs it again on everything that comes over IPC, because the
 * main process should not trust the renderer.
 */
export function validateLot(raw: unknown, now: Date = new Date()): ValidationResult {
  const input = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const errors: Partial<Record<LotField, string>> = {};

  const ticker = typeof input.ticker === 'string' ? input.ticker.trim().toUpperCase() : '';
  if (!TICKER_PATTERN.test(ticker)) {
    errors.ticker = 'Enter a ticker like MU or BRK.B.';
  }

  const shares = input.shares;
  if (typeof shares !== 'number' || !Number.isFinite(shares) || shares <= 0) {
    errors.shares = 'Shares must be a number above 0.';
  }

  const buyPrice = input.buyPrice;
  if (typeof buyPrice !== 'number' || !Number.isFinite(buyPrice) || buyPrice <= 0) {
    errors.buyPrice = 'Buy price must be a number above 0.';
  }

  const boughtOn = typeof input.boughtOn === 'string' ? input.boughtOn : '';
  if (!isCalendarDate(boughtOn)) {
    errors.boughtOn = 'Enter the date of the purchase.';
  } else if (boughtOn > localDate(now)) {
    errors.boughtOn = 'The purchase date cannot be in the future.';
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      ticker,
      shares: shares as number,
      buyPrice: buyPrice as number,
      boughtOn,
    },
  };
}
