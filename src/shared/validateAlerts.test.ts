import { describe, expect, it } from 'vitest';
import { validateAlerts } from './validateAlerts.js';

const good = { dayMovePct: 3, gainPct: 20, lossPct: null, earnings: true, news: false };

describe('validateAlerts', () => {
  it('accepts valid settings, with null meaning off', () => {
    expect(validateAlerts(good)).toEqual({ ok: true, value: good });
    const allOff = { dayMovePct: null, gainPct: null, lossPct: null, earnings: false, news: false };
    expect(validateAlerts(allOff)).toEqual({ ok: true, value: allOff });
  });

  it('rejects zero, negative and non-numeric percentages', () => {
    for (const bad of [0, -3, Number.NaN, '3', 5000]) {
      const result = validateAlerts({ ...good, dayMovePct: bad });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.dayMovePct).toBeDefined();
    }
  });

  it('requires the on/off switches to be booleans', () => {
    expect(validateAlerts({ ...good, news: 'yes' }).ok).toBe(false);
    expect(validateAlerts(null).ok).toBe(false);
  });
});
