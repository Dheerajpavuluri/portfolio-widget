import type { AlertSettings } from './types.js';

export type AlertField = keyof AlertSettings;

export type AlertValidation =
  | { ok: true; value: AlertSettings }
  | { ok: false; errors: Partial<Record<AlertField, string>> };

const PERCENT_FIELDS = ['dayMovePct', 'gainPct', 'lossPct'] as const;

/**
 * Checks alert settings before they are saved. Like lots, the form uses this
 * for messages and the main process runs it again on what arrives over IPC.
 */
export function validateAlerts(raw: unknown): AlertValidation {
  const input = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const errors: Partial<Record<AlertField, string>> = {};
  const value: Partial<AlertSettings> = {};

  for (const field of PERCENT_FIELDS) {
    const v = input[field];
    if (v === null || v === undefined) {
      value[field] = null;
    } else if (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 1000) {
      value[field] = v;
    } else {
      errors[field] = 'Enter a percentage above 0, or leave it empty for off.';
    }
  }

  for (const field of ['earnings', 'news'] as const) {
    if (typeof input[field] !== 'boolean') errors[field] = 'Must be on or off.';
    else value[field] = input[field] as boolean;
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value: value as AlertSettings };
}
