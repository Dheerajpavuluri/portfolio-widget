const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const shareCount = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 });

const dateTime = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export const formatMoney = (value: number) => money.format(value);

export const formatShares = (value: number) => shareCount.format(value);

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));

/**
 * Turns an ISO timestamp into the "YYYY-MM-DDTHH:mm" string a
 * datetime-local input expects, in the user's own time zone.
 */
export function toLocalInputValue(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** The reverse: a datetime-local value is local time, and we store UTC ISO strings. */
export function fromLocalInputValue(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}
