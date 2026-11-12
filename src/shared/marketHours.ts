/**
 * A fallback for when Finnhub's market status cannot be fetched: regular US
 * trading hours are 9:30 AM to 4:00 PM New York time, Monday to Friday.
 * Holidays are not known here, so on a holiday this guesses "open".
 */
export function isRegularTradingHours(now: Date): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';

  if (get('weekday') === 'Sat' || get('weekday') === 'Sun') return false;
  const minutes = Number(get('hour')) * 60 + Number(get('minute'));
  return minutes >= 9 * 60 + 30 && minutes < 16 * 60;
}
