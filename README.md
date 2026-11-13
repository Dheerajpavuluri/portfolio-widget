# Portfolio Widget

A small desktop widget that shows my stock positions and how they are doing, without opening my brokerage app. I enter my trades by hand, and the widget tracks each purchase separately and combines them per ticker.

Built with Electron, React and TypeScript. Everything stays on my machine.

## What works so far

This is milestone 2 of 6.

- Add, edit and delete lots (ticker, shares, buy price per share, buy date), with validation
- Lots of the same ticker grouped into one card per ticker: price, day change with an up or down arrow, shares, average cost, amount invested, value now, and total P&L
- For every lot: amount invested, value now, and P&L in dollars and percent
- A footer with the portfolio's total invested, value now, total P&L and today's change. Positions without a price are left out of all four and listed underneath, so value now minus invested always equals total P&L
- Prices from Finnhub, refreshed every minute while the market is open, labeled as delayed, with the time of the latest price
- A clear market-closed state that shows the last price instead of pretending it is live
- Tickers Finnhub cannot price say so on their card and are left out of the totals, instead of showing $0
- Lots saved to a local JSON file, written atomically so a crash cannot corrupt it
- Only one copy of the app runs at a time; starting it again brings the open window to the front

### Roadmap

1. Project setup, lot entry, local storage, P&L math and tests (done)
2. Live quotes and per-ticker cards with P&L (done)
3. Market strip and combined portfolio view
4. Threshold alerts
5. Plain-language Q&A about my positions and a morning digest
6. Polish, screenshots

## Running it

You need Node.js 22 or newer, and a free API key from [finnhub.io](https://finnhub.io).

Put the key in a file called `.env` in the project folder:

```
FINNHUB_API_KEY=your_key_here
```

`.gitignore` excludes `.env`, so the key never reaches the repo. Then:

```bash
npm install
npm run dev      # development: the window reloads when renderer code changes
npm start        # builds everything and runs the built app
```

Changes to `src/main` or `src/preload` need `npm run dev` to be restarted. Closing the window quits the app on every platform, including macOS.

## Tests

```bash
npm test             # runs every test once
npm run test:watch   # re-runs tests on save
npm run typecheck
```

The tests cover:

- the P&L math, including the two-lot Micron case below (`src/shared/pnl.test.ts`)
- lot validation (`src/shared/validateLot.test.ts`)
- the file store: saving, reloading, concurrent saves, failed saves, unreadable files and upgrading old files (`src/main/lotStore.test.ts`, `src/main/migrate.test.ts`)
- quote parsing, including Finnhub's all-zero answer for unknown tickers, and how HTTP errors are reported (`src/main/finnhub.test.ts`)
- when prices are refreshed, open versus closed market, new tickers, unavailable tickers and failed refreshes (`src/main/quoteService.test.ts`)
- regular trading hours across daylight saving time (`src/shared/marketHours.test.ts`)
- finding the API key (`src/main/apiKey.test.ts`)

The tests never call Finnhub. They use fake responses shaped like Finnhub's real ones.

## How the P&L math works

Each purchase is a **lot**. A **position** is all the lots for one ticker. Positions are never stored; they are rebuilt from the lots every time, so there is only one source of truth.

| Number | Formula |
| --- | --- |
| Lot P&L | (current price - buy price) x shares |
| Position P&L | sum of its lots' P&L |
| Portfolio P&L | sum of every position's P&L |
| Average cost | total paid / total shares, so bigger lots count for more |
| P&L % | P&L / what was paid |

Example: I buy one Micron share at $950 yesterday and another at $850 today. Micron is now at $900.

| Lot | Bought | P&L |
| --- | --- | --- |
| 1 share at $950 | yesterday | (900 - 950) x 1 = -$50 |
| 1 share at $850 | today | (900 - 850) x 1 = +$50 |
| Position: 2 shares, average cost $900 | | $0 |

**Day change.** Day change is measured against the previous close, with one exception. A lot bought today did not exist at yesterday's close, so it is measured from its buy price instead.

In the example, Micron closed at $920 yesterday. The first lot is down $20 today (900 - 920). The second lot is up $50 (900 - 850). The position is up $30 for the day. If I measured both lots from the previous close, it would show -$40, a loss I never had.

I record only the date of each purchase, not the time. The date is all the day-change rule needs: a lot counts as "bought today" when its date matches the trading day of the quote. That trading day is the quote's date in New York, because that is the market's clock, so a quote at 7 PM Eastern still belongs to that day even though it is already tomorrow in UTC.

Dates are stored as plain `YYYY-MM-DD` text with no time zone, so "Nov 5" stays Nov 5 wherever the computer is. Lots bought on the same day are listed in the order I added them.

All math runs at full precision; values are rounded to cents only when they are displayed. The functions in `src/shared/pnl.ts` are pure (no network, no files, no clock), which is what makes them easy to test.

## How prices work

Prices come from Finnhub's free plan, which I treat as about 15 minutes behind. The window always says "Delayed ~15 min" next to the time of the newest price.

- **Refreshing.** Every 60 seconds the app asks Finnhub whether the US market is open (`/stock/market-status`). While it is open, every ticker I hold is re-quoted (`/quote`).
- **Closed market.** While the market is closed, prices cannot change, so the app stops re-quoting. It makes one last round right after the close to pick up closing prices. The status line then says "Market closed" and shows the time of the last price.
- **New tickers.** A ticker I just added is quoted immediately, open or closed.
- **No price.** For a ticker Finnhub does not know, it answers with all zeros, not an error. The app reads that as "no price" and says so on the card, as it does when the free plan does not cover a ticker. Those positions show their cost but are left out of the P&L totals, and the footer lists them.
- **Failures.** If a refresh fails (no internet, rate limit, bad key), the last good prices stay on screen and the status line says what went wrong and how old the prices are.
- **Fallback.** If Finnhub cannot tell me whether the market is open, I fall back to regular trading hours (9:30 AM to 4:00 PM New York time, weekdays) and the status line says "Market likely open" or "Market likely closed", because that guess does not know about holidays.

The free plan's limit is 60 calls a minute. Each refresh uses one status call plus one call per ticker, so this works for up to about 50 tickers.

## Storage and privacy

My lots live in one file, `portfolio.json`, in the app's user data folder:

- macOS: `~/Library/Application Support/portfolio-widget/`
- Windows: `%APPDATA%\portfolio-widget\`
- Linux: `~/.config/portfolio-widget/`

Nothing is stored in the project folder. The only network traffic is quote and market-status requests to Finnhub, which carry ticker symbols and nothing about my positions.

**How saving works:**

- Every save writes a temporary file next to `portfolio.json`, flushes it to disk, and renames it over the old file. A rename in the same folder is atomic, so after a crash the file is either the old version or the new one.
- Saves go through a queue, so two quick edits cannot overwrite each other.
- The in-memory copy is updated only after the file is written, so a failed save never shows data that was not saved.
- If the file cannot be read (for example after a manual edit went wrong), it is renamed to `portfolio.json.unreadable-<time>` instead of being overwritten, and the app starts empty.
- The file has a `version` number. When the format changes, the app upgrades older files on startup and first saves a copy as `portfolio.json.v<old version>-backup`. Version 1 stored a full purchase timestamp; version 2 stores only the date, using the date the timestamp showed on my computer.

The Finnhub key is read from `.env` (or a `FINNHUB_API_KEY` environment variable) by the main process only. It is sent to Finnhub in a request header rather than in the URL, so it never appears in addresses or error messages.

## How the app is put together

Electron runs two kinds of process. The main process has full Node.js access. The renderer is the web page I see. I keep the page locked down:

- **Context isolation, sandbox, and no Node.js in the page.** The page cannot reach the file system, environment variables or the API key.
- **One narrow bridge.** The preload script exposes six functions on `window.portfolio`: `listLots`, `addLot`, `updateLot`, `deleteLot`, `getQuotes` and `onQuotes`. The first five send an IPC message to the main process; `onQuotes` receives the price updates the main process pushes after each refresh. Only the price data is passed to the page, never Electron's IPC event object.
- **The main process checks everything.** It re-validates every lot that comes over IPC, even though the form already checked it, and it only answers messages from the app's own page.
- **The page loads nothing from outside.** The built page has a Content Security Policy that only allows the app's own files. It cannot navigate away or open new windows.

```
src/
  main/       Electron main process: window, IPC handlers, file storage, Finnhub client, price refresh
  preload/    the bridge between the page and the main process
  renderer/   React UI
  shared/     types, P&L math, validation and trading hours used by both sides
scripts/
  dev.mjs     starts Vite and Electron together for development
```
