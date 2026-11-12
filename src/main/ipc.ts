import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { IpcChannel, Lot, LotInput } from '../shared/types.js';
import { validateLot } from '../shared/validateLot.js';
import type { LotStore } from './lotStore.js';
import type { QuoteService } from './quoteService.js';

interface Handlers {
  store: LotStore;
  quotes: QuoteService;
  isTrustedSender: (url: string) => boolean;
}

/**
 * Connects the renderer's requests to the lot store and the quote service.
 *
 * Arguments from the renderer are treated as untrusted: each one is checked
 * here even though the form already validated it.
 */
export function registerIpcHandlers({ store, quotes, isTrustedSender }: Handlers): void {
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
}

function checkLot(input: unknown): LotInput {
  const result = validateLot(input);
  if (!result.ok) throw new Error(`Invalid lot: ${Object.values(result.errors).join(' ')}`);
  return result.value;
}

function checkId(id: unknown): string {
  if (typeof id !== 'string' || id.length === 0) throw new Error('Invalid lot id');
  return id;
}
