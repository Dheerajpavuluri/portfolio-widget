import { randomUUID } from 'node:crypto';
import { copyFile, readFile, rename } from 'node:fs/promises';
import type { AlertSettings, Lot, LotInput, StoredData } from '../shared/types.js';
import { writeFileAtomic } from './atomicWrite.js';
import { migrate } from './migrate.js';

type Writer = (filePath: string, contents: string) => Promise<void>;

const EMPTY: StoredData = { version: 3, lots: [], alerts: {} };

/**
 * Keeps my lots and alert settings in memory and in a JSON file on disk.
 *
 * Every change runs through one queue, so two quick edits cannot interleave,
 * and memory is only updated after the file has been written. If a save
 * fails, the app keeps showing what is actually on disk.
 */
export class PortfolioStore {
  private data: StoredData = EMPTY;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    private readonly write: Writer = writeFileAtomic,
  ) {}

  async load(): Promise<void> {
    let text: string;
    try {
      text = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.data = EMPTY;
        return;
      }
      throw error;
    }

    const raw = parseJson(text);
    const data = migrate(raw);

    if (!data) {
      // Keep the unreadable file instead of overwriting it, so nothing is lost
      // and it can be fixed by hand.
      const asidePath = `${this.filePath}.unreadable-${Date.now()}`;
      await rename(this.filePath, asidePath);
      console.warn(`Could not read ${this.filePath}. Moved it to ${asidePath} and started empty.`);
      this.data = EMPTY;
      return;
    }

    const oldVersion = (raw as { version: number }).version;
    if (oldVersion !== data.version) {
      // Keep a copy of the old file before upgrading it, in case the upgrade
      // ever gets something wrong.
      await copyFile(this.filePath, `${this.filePath}.v${oldVersion}-backup`);
      await this.write(this.filePath, serialize(data));
    }
    this.data = data;
  }

  list(): Lot[] {
    return [...this.data.lots];
  }

  alerts(): Record<string, AlertSettings> {
    return { ...this.data.alerts };
  }

  async add(input: LotInput): Promise<Lot[]> {
    await this.change((d) => ({ ...d, lots: [...d.lots, { id: randomUUID(), ...input }] }));
    return this.list();
  }

  async update(id: string, input: LotInput): Promise<Lot[]> {
    await this.change((d) => {
      if (!d.lots.some((lot) => lot.id === id)) throw new Error(`No lot with id ${id}`);
      return { ...d, lots: d.lots.map((lot) => (lot.id === id ? { id, ...input } : lot)) };
    });
    return this.list();
  }

  async remove(id: string): Promise<Lot[]> {
    await this.change((d) => {
      if (!d.lots.some((lot) => lot.id === id)) throw new Error(`No lot with id ${id}`);
      return { ...d, lots: d.lots.filter((lot) => lot.id !== id) };
    });
    return this.list();
  }

  async setAlerts(ticker: string, settings: AlertSettings): Promise<Record<string, AlertSettings>> {
    await this.change((d) => ({ ...d, alerts: { ...d.alerts, [ticker]: settings } }));
    return this.alerts();
  }

  private change(apply: (data: StoredData) => StoredData): Promise<void> {
    const run = this.queue.then(async () => {
      const next = apply(this.data);
      await this.write(this.filePath, serialize(next));
      this.data = next;
    });
    // A failed change should not block the ones queued after it.
    this.queue = run.catch(() => undefined);
    return run;
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function serialize(data: StoredData): string {
  return JSON.stringify(data, null, 2);
}
