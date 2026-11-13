import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { AlertSettings, Digest, IpcChannel, Lot, LotInput } from '../shared/types.js';
import { validateAlerts } from '../shared/validateAlerts.js';
import { validateLot } from '../shared/validateLot.js';
import { MAX_QUESTION_LENGTH, type Copilot } from './copilot.js';
import type { PortfolioStore } from './store.js';
import type { QuoteService } from './quoteService.js';

interface Handlers {
  store: PortfolioStore;
  quotes: QuoteService;
  copilot: Copilot;
  digest: () => Digest;
  isTrustedSender: (url: string) => boolean;
  /** Runs after alert settings change, so a new threshold is checked right away. */
  onAlertsChanged: () => void;
}

/**
 * Connects the renderer's requests to the store, prices, alerts and the copilot.
 *
 * Arguments from the renderer are treated as untrusted: each one is checked
 * here even though the form already validated it.
 */
export function registerIpcHandlers(handlers: Handlers): void {
  const { store, quotes, copilot, digest, isTrustedSender, onAlertsChanged } = handlers;
  const handle = (channel: IpcChannel, handler: (...args: unknown[]) => unknown) => {
    ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
      const url = event.senderFrame?.url ?? '';
      if (!isTrustedSender(url)) throw new Error(`Rejected ${channel} from ${url}`);
      return handler(...args);
    });
  };

  // After any change, a ticker may have been added or removed, so prices are refreshed.
  const afterChange = (lots: Lot[]) => {
    void quotes.tickersChanged();
    return lots;
  };

  handle('lots:list', () => store.list());
  handle('lots:add', async (input) => afterChange(await store.add(checkLot(input))));
  handle('lots:update', async (id, input) => afterChange(await store.update(checkId(id), checkLot(input))));
  handle('lots:delete', async (id) => afterChange(await store.remove(checkId(id))));
  handle('quotes:get', () => quotes.current());
  handle('alerts:get', () => store.alerts());
  handle('alerts:set', async (ticker, settings) => {
    const saved = await store.setAlerts(checkTicker(ticker), checkAlerts(settings));
    onAlertsChanged();
    return saved;
  });
  handle('copilot:info', () => copilot.info());
  handle('copilot:ask', (question) => copilot.ask(checkQuestion(question)));
  handle('digest:get', () => digest());
}

function checkQuestion(question: unknown): string {
  if (typeof question !== 'string' || question.trim() === '') throw new Error('Type a question first.');
  if (question.length > MAX_QUESTION_LENGTH) throw new Error(`Keep questions under ${MAX_QUESTION_LENGTH} characters.`);
  return question.trim();
}

function checkLot(input: unknown): LotInput {
  const result = validateLot(input);
  if (!result.ok) throw new Error(`Invalid lot: ${Object.values(result.errors).join(' ')}`);
  return result.value;
}

function checkAlerts(input: unknown): AlertSettings {
  const result = validateAlerts(input);
  if (!result.ok) throw new Error(`Invalid alert settings: ${Object.values(result.errors).join(' ')}`);
  return result.value;
}

function checkTicker(ticker: unknown): string {
  // Same rule as the lot form, so settings can only be saved for a real-looking ticker.
  if (typeof ticker !== 'string' || !/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) throw new Error('Invalid ticker');
  return ticker;
}

function checkId(id: unknown): string {
  if (typeof id !== 'string' || id.length === 0) throw new Error('Invalid lot id');
  return id;
}
