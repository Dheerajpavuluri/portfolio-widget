const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const shareCount = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 });

const calendarDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export const formatMoney = (value: number) => money.format(value);

export const formatShares = (value: number) => shareCount.format(value);

/** "2026-11-05" -> "Nov 5, 2026" */
export function formatDate(ymd: string): string {
  const [year, month, day] = ymd.split('-').map(Number);
  // Built from local parts: new Date("2026-11-05") would mean midnight UTC,
  // which is still Nov 4 in California.
  return calendarDate.format(new Date(year, month - 1, day));
}
