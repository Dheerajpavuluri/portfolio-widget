const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

// Shows "+" for gains as well as "-" for losses, so the direction is never only a color.
const signedMoney = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', signDisplay: 'exceptZero' });

const signedPercent = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
});

const shareCount = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 });

const calendarDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

const calendarDateThisYear = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

const timeOfDay = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

const dayAndTime = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });

export const formatMoney = (value: number) => money.format(value);

export const formatSignedMoney = (value: number) => signedMoney.format(value);

/** Takes a percentage like 1.5 (meaning 1.5%), the way pnl.ts returns them. */
export const formatSignedPercent = (value: number) => signedPercent.format(value / 100);

export const formatShares = (value: number) => shareCount.format(value);

/** "2026-11-05" -> "Nov 5", or "Nov 5, 2025" when it is not this year. */
export function formatDate(ymd: string, now: Date = new Date()): string {
  const [year, month, day] = ymd.split('-').map(Number);
  // Built from local parts: new Date("2026-11-05") would mean midnight UTC,
  // which is still Nov 4 in California.
  const date = new Date(year, month - 1, day);
  return (year === now.getFullYear() ? calendarDateThisYear : calendarDate).format(date);
}

/** "3:41 PM" for today, "Fri 1:00 PM" for an older timestamp. */
export function formatQuoteTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  return date.toDateString() === now.toDateString() ? timeOfDay.format(date) : dayAndTime.format(date);
}

/** "up", "down" or "flat", used for the arrow and the color. */
export function direction(value: number): 'up' | 'down' | 'flat' {
  // Below half a cent the change rounds to $0.00, so it should not look like a move.
  if (Math.abs(value) < 0.005) return 'flat';
  return value > 0 ? 'up' : 'down';
}

/**
 * The readable part of an error from the main process. Electron wraps them as
 * "Error invoking remote method 'x': SomeError: message", and only the message is for me.
 */
export function errorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/^Error invoking remote method '[^']+': (\w+: )?/, '');
}
