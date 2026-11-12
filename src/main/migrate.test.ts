import { describe, expect, it } from 'vitest';
import { migrate } from './migrate.js';

// Stand-in for "the date in the computer's time zone", fixed to Pacific time
// so these tests give the same answer on any machine.
const pacificDate = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date(iso));

describe('migrate', () => {
  it('returns version 2 files unchanged', () => {
    const data = { version: 2, lots: [{ id: 'a', ticker: 'MU', shares: 1, buyPrice: 850, boughtOn: '2026-11-05' }] };
    expect(migrate(data)).toEqual(data);
  });

  it('turns version 1 timestamps into the date the user saw', () => {
    const v1 = {
      version: 1,
      lots: [
        { id: 'a', ticker: 'MU', shares: 0.2, buyPrice: 753.87, boughtAt: '2026-11-05T22:20:00.000Z' },
        // 11:26 PM on Sep 11 in California, already Sep 12 in UTC.
        { id: 'b', ticker: 'MU', shares: 0.077, buyPrice: 908.66, boughtAt: '2026-09-12T06:26:00.000Z' },
      ],
    };
    expect(migrate(v1, pacificDate)).toEqual({
      version: 2,
      lots: [
        { id: 'a', ticker: 'MU', shares: 0.2, buyPrice: 753.87, boughtOn: '2026-11-05' },
        { id: 'b', ticker: 'MU', shares: 0.077, buyPrice: 908.66, boughtOn: '2026-09-11' },
      ],
    });
  });

  it('rejects anything it does not recognise', () => {
    for (const raw of [null, 'text', {}, { version: 3, lots: [] }, { version: 2 }, { version: 1, lots: 'no' }]) {
      expect(migrate(raw)).toBeNull();
    }
  });
});
