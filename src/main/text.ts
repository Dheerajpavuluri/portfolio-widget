// Number formatting for text the main process writes: notifications, the data
// sent with a question, and the digest. Same look as the window: $3,140.98.

const dollars = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const money = (value: number) => `$${dollars.format(value)}`;

/** "+$1,068.30", "-$19.25" or "$0.00", so a gain never reads as a loss. */
export const signedMoney = (value: number) =>
  `${value > 0 ? '+' : value < 0 ? '-' : ''}$${dollars.format(Math.abs(value))}`;

/** "+7.44%" or "-0.61%". Takes 7.44 for 7.44%, the way pnl.ts returns percentages. */
export const pct = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
