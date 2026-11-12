import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { IpcChannel, LotInput } from '../shared/types.js';
import { validateLot } from '../shared/validateLot.js';
import type { LotStore } from './lotStore.js';

/**
 * Connects the renderer's requests to the lot store.
 *
 * Arguments from the renderer are treated as untrusted: each one is checked
 * here even though the form already validated it.
 */
export function registerLotHandlers(store: LotStore, isTrustedSender: (url: string) => boolean): void {
  const handle = (channel: IpcChannel, handler: (...args: unknown[]) => unknown) => {
    ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
      const url = event.senderFrame?.url ?? '';
      if (!isTrustedSender(url)) throw new Error(`Rejected ${channel} from ${url}`);
      return handler(...args);
    });
  };

  handle('lots:list', () => store.list());
  handle('lots:add', (input) => store.add(checkLot(input)));
  handle('lots:update', (id, input) => store.update(checkId(id), checkLot(input)));
  handle('lots:delete', (id) => store.remove(checkId(id)));
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
