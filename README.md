# Portfolio Widget

A small desktop widget that shows my stock positions and how they are doing, without opening my brokerage app. I enter my trades by hand, and the widget tracks each purchase separately and combines them per ticker.

Built with Electron, React and TypeScript. Everything stays on my machine.

## What works so far

This is milestone 1 of 6.

- Add, edit and delete lots (ticker, shares, buy price, buy date and time), with validation
- Lots of the same ticker grouped into one position, showing total shares, average cost and cost basis
- Lots saved to a local JSON file, written atomically so a crash cannot corrupt it
- P&L math for each lot, each position and the whole portfolio, including day change, with unit tests

Live prices are not connected yet, so the cards show cost only. The P&L math is finished and tested, ready for when quotes arrive in milestone 2.

### Roadmap

1. Project setup, lot entry, local storage, P&L math and tests (done)
2. Live quotes and per-ticker cards with P&L
3. Market strip and combined portfolio view
4. Threshold alerts
5. Plain-language Q&A about my positions and a morning digest
6. Polish, screenshots

## Running it

You need Node.js 20 or newer.

```bash
npm install
npm run dev      # development: the window reloads when renderer code changes
npm start        # builds everything and runs the built app
```

Changes to `src/main` or `src/preload` need `npm run dev` to be restarted.

## Tests

```bash
npm test             # runs every test once
npm run test:watch   # re-runs tests on save
npm run typecheck
```

The tests cover:

- the P&L math, including the two-lot Micron case below (`src/shared/pnl.test.ts`)
- lot validation (`src/shared/validateLot.test.ts`)
- the file store: saving, reloading, concurrent saves, failed saves and unreadable files (`src/main/lotStore.test.ts`)

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

"Today" means today in New York, because that is the market's clock. A purchase at 8 PM Pacific counts as the same trading day even though it is already the next day in UTC.

All math runs at full precision; values are rounded to cents only when they are displayed. The functions in `src/shared/pnl.ts` are pure (no network, no files, no clock), which is what makes them easy to test.

## Storage and privacy

My lots live in one file, `portfolio.json`, in the app's user data folder:

- macOS: `~/Library/Application Support/portfolio-widget/`
- Windows: `%APPDATA%\portfolio-widget\`
- Linux: `~/.config/portfolio-widget/`

Nothing is stored in the project folder, and nothing leaves the machine. Starting in milestone 2, the only network traffic will be quote requests.

**How saving works:**

- Every save writes a temporary file next to `portfolio.json`, flushes it to disk, and renames it over the old file. A rename in the same folder is atomic, so after a crash the file is either the old version or the new one.
- Saves go through a queue, so two quick edits cannot overwrite each other.
- The in-memory copy is updated only after the file is written, so a failed save never shows data that was not saved.
- If the file cannot be read (for example after a manual edit went wrong), it is renamed to `portfolio.json.unreadable-<time>` instead of being overwritten, and the app starts empty.

API keys, once they are needed, will go in a local `.env` file. `.gitignore` excludes it.

## How the app is put together

Electron runs two kinds of process. The main process has full Node.js access. The renderer is the web page I see. I keep the page locked down:

- **Context isolation, sandbox, and no Node.js in the page.** The page cannot reach the file system, environment variables or API keys.
- **One narrow bridge.** The preload script exposes four functions on `window.portfolio`: `listLots`, `addLot`, `updateLot` and `deleteLot`. Each one sends an IPC message to the main process.
- **The main process checks everything.** It re-validates every lot that comes over IPC, even though the form already checked it, and it only answers messages from the app's own page.
- **The page loads nothing from outside.** The built page has a Content Security Policy that only allows the app's own files. It cannot navigate away or open new windows.

```
src/
  main/       Electron main process: window, IPC handlers, file storage
  preload/    the bridge between the page and the main process
  renderer/   React UI
  shared/     types, P&L math and validation used by both sides
scripts/
  dev.mjs     starts Vite and Electron together for development
```
