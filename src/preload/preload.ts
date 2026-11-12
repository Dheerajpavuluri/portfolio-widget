import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { IpcChannel, IpcEvent, LotInput, PortfolioApi, QuoteSnapshot } from '../shared/types.js';

// A sandboxed preload script can only require 'electron', so this file must
// not import any of our own code at runtime. Type-only imports are fine
// because they disappear when compiled.

const invoke = (channel: IpcChannel, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args);

// The renderer gets these functions and nothing else: no ipcRenderer,
// no file system, no environment variables, no API key.
const api: PortfolioApi = {
  listLots: () => invoke('lots:list'),
  addLot: (input: LotInput) => invoke('lots:add', input),
  updateLot: (id: string, input: LotInput) => invoke('lots:update', id, input),
  deleteLot: (id: string) => invoke('lots:delete', id),
  getQuotes: () => invoke('quotes:get'),
  onQuotes: (listener) => {
    const channel: IpcEvent = 'quotes:updated';
    // Only the snapshot is passed on. The IPC event object would give the page
    // a handle back into Electron, so it stays here.
    const wrapped = (_event: IpcRendererEvent, snapshot: QuoteSnapshot) => listener(snapshot);
    ipcRenderer.on(channel, wrapped);
    return () => {
      ipcRenderer.removeListener(channel, wrapped);
    };
  },
};

contextBridge.exposeInMainWorld('portfolio', api);
