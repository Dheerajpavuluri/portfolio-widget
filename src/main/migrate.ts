import { localDate } from '../shared/dates.js';
import type { AlertSettings, Lot, StoredData } from '../shared/types.js';

// Version history of the data file:
//   1: lots had boughtAt, a full ISO timestamp
//   2: lots have boughtOn, a plain YYYY-MM-DD date
//   3: adds alert settings per ticker

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
  const data = raw as { version?: unknown; lots?: unknown; alerts?: unknown };
  if (!Array.isArray(data.lots)) return null;

  // Lots changed shape in version 2; alert settings were added in version 3.
  let lots: Lot[];
  if (data.version === 1) {
    lots = (data.lots as V1Lot[]).map(({ boughtAt, ...rest }) => ({ ...rest, boughtOn: dateOf(boughtAt) }));
  } else if (data.version === 2 || data.version === 3) {
    lots = data.lots as Lot[];
  } else {
    return null;
  }

  const alerts =
    data.version === 3 && typeof data.alerts === 'object' && data.alerts !== null
      ? (data.alerts as Record<string, AlertSettings>)
      : {};

  return { version: 3, lots, alerts };
}
