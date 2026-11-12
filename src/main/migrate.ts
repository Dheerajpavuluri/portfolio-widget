import { localDate } from '../shared/dates.js';
import type { Lot, StoredData } from '../shared/types.js';

// Version history of the data file:
//   1: lots had boughtAt, a full ISO timestamp
//   2: lots have boughtOn, a plain YYYY-MM-DD date

interface V1Lot extends Omit<Lot, 'boughtOn'> {
  boughtAt: string;
}

/**
 * Reads any known version of the data file and returns the current shape,
 * or null if the contents are not something this app wrote.
 *
 * `dateOf` turns an old timestamp into a date. It defaults to the computer's
 * time zone, which is the zone the user typed the time in, so a lot entered
 * as "Nov 5, 2:20 PM" becomes Nov 5.
 */
export function migrate(raw: unknown, dateOf: (iso: string) => string = (iso) => localDate(new Date(iso))): StoredData | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const data = raw as { version?: unknown; lots?: unknown };
  if (!Array.isArray(data.lots)) return null;

  if (data.version === 2) {
    return { version: 2, lots: data.lots as Lot[] };
  }

  if (data.version === 1) {
    const lots = (data.lots as V1Lot[]).map(({ boughtAt, ...rest }) => ({ ...rest, boughtOn: dateOf(boughtAt) }));
    return { version: 2, lots };
  }

  return null;
}
