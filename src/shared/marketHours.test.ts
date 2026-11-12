import { describe, expect, it } from 'vitest';
import { isRegularTradingHours } from './marketHours.js';

describe('isRegularTradingHours', () => {
  it('is open from 9:30 AM to just before 4:00 PM New York time on weekdays', () => {
    // Thursday Nov 12, 2026. New York is on EST (UTC-5).
    expect(isRegularTradingHours(new Date('2026-11-12T14:29:00Z'))).toBe(false); // 9:29 AM
    expect(isRegularTradingHours(new Date('2026-11-12T14:30:00Z'))).toBe(true); // 9:30 AM
    expect(isRegularTradingHours(new Date('2026-11-12T20:59:00Z'))).toBe(true); // 3:59 PM
    expect(isRegularTradingHours(new Date('2026-11-12T21:00:00Z'))).toBe(false); // 4:00 PM
  });

  it('follows daylight saving time', () => {
    // Thursday Jul 9, 2026. New York is on EDT (UTC-4), so 9:30 AM is 13:30 UTC.
    expect(isRegularTradingHours(new Date('2026-07-09T13:30:00Z'))).toBe(true);
    expect(isRegularTradingHours(new Date('2026-07-09T20:00:00Z'))).toBe(false);
  });

  it('is closed on weekends', () => {
    expect(isRegularTradingHours(new Date('2026-11-14T16:00:00Z'))).toBe(false); // Saturday noon
    expect(isRegularTradingHours(new Date('2026-11-15T16:00:00Z'))).toBe(false); // Sunday noon
  });
});
