// Purchase dates are plain calendar dates ("2026-11-05") with no time or time
// zone. Building them from local date parts, not toISOString(), keeps an
// evening purchase on the day the user saw it, instead of the next day in UTC.

const pad = (n: number) => String(n).padStart(2, '0');

/** The date in the computer's own time zone, as YYYY-MM-DD. */
export function localDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** True for a real date written as YYYY-MM-DD. Rejects things like 2026-02-30. */
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}
