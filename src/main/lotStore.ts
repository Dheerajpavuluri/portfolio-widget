import { randomUUID } from 'node:crypto';
import { copyFile, readFile, rename } from 'node:fs/promises';
import type { Lot, LotInput, StoredData } from '../shared/types.js';
import { writeFileAtomic } from './atomicWrite.js';
import { migrate } from './migrate.js';

type Writer = (filePath: string, contents: string) => Promise<void>;

/**
 * Keeps the lots in memory and in a JSON file on disk.
 *
 * Every change runs through one queue, so two quick edits cannot interleave,
 * and memory is only updated after the file has been written. If a save
 * fails, the app keeps showing what is actually on disk.
 */
export class LotStore {
  private lots: Lot[] = [];
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
        this.lots = [];
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
      this.lots = [];
      return;
    }

    const oldVersion = (raw as { version: number }).version;
    if (oldVersion !== data.version) {
      // Keep a copy of the old file before upgrading it, in case the upgrade
      // ever gets something wrong.
      await copyFile(this.filePath, `${this.filePath}.v${oldVersion}-backup`);
      await this.write(this.filePath, serialize(data.lots));
    }
    this.lots = data.lots;
  }

  list(): Lot[] {
    return [...this.lots];
  }

  add(input: LotInput): Promise<Lot[]> {
    return this.change((lots) => [...lots, { id: randomUUID(), ...input }]);
  }

  update(id: string, input: LotInput): Promise<Lot[]> {
    return this.change((lots) => {
      if (!lots.some((lot) => lot.id === id)) throw new Error(`No lot with id ${id}`);
      return lots.map((lot) => (lot.id === id ? { id, ...input } : lot));
    });
  }

  remove(id: string): Promise<Lot[]> {
    return this.change((lots) => {
      if (!lots.some((lot) => lot.id === id)) throw new Error(`No lot with id ${id}`);
      return lots.filter((lot) => lot.id !== id);
    });
  }

  private change(apply: (lots: Lot[]) => Lot[]): Promise<Lot[]> {
    const run = this.queue.then(async () => {
      const next = apply(this.lots);
      await this.write(this.filePath, serialize(next));
      this.lots = next;
      return this.list();
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

function serialize(lots: Lot[]): string {
  const data: StoredData = { version: 2, lots };
  return JSON.stringify(data, null, 2);
}
