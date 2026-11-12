import { contextBridge, ipcRenderer } from 'electron';
import type { IpcChannel, LotInput, PortfolioApi } from '../shared/types.js';

// A sandboxed preload script can only require 'electron', so this file must
// not import any of our own code at runtime. Type-only imports are fine
// because they disappear when compiled.

const invoke = (channel: IpcChannel, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args);

// The renderer gets these four functions and nothing else: no ipcRenderer,
// no file system, no environment variables.
const api: PortfolioApi = {
  listLots: () => invoke('lots:list'),
  addLot: (input: LotInput) => invoke('lots:add', input),
  updateLot: (id: string, input: LotInput) => invoke('lots:update', id, input),
  deleteLot: (id: string) => invoke('lots:delete', id),
};

contextBridge.exposeInMainWorld('portfolio', api);
