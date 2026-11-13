import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LotInput } from '../shared/types.js';
import { writeFileAtomic } from './atomicWrite.js';
import { PortfolioStore } from './store.js';

const micron: LotInput = { ticker: 'MU', shares: 1, buyPrice: 950, boughtOn: '2026-11-11' };

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'portfolio-widget-'));
  file = join(dir, 'portfolio.json');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('PortfolioStore', () => {
  it('starts empty when there is no file yet', async () => {
    const store = new PortfolioStore(file);
    await store.load();
    expect(store.list()).toEqual([]);
  });

  it('saves lots and reads them back in a new session', async () => {
    const store = new PortfolioStore(file);
    await store.load();
    const [saved] = await store.add(micron);
    expect(saved).toMatchObject(micron);
    expect(saved.id).toBeTruthy();

    const reopened = new PortfolioStore(file);
    await reopened.load();
    expect(reopened.list()).toEqual([saved]);
  });

  it('edits and deletes a lot', async () => {
    const store = new PortfolioStore(file);
    await store.load();
    const [saved] = await store.add(micron);

    const [edited] = await store.update(saved.id, { ...micron, buyPrice: 940 });
    expect(edited).toEqual({ ...saved, buyPrice: 940 });

    expect(await store.remove(saved.id)).toEqual([]);
  });

  it('rejects edits to a lot that does not exist and leaves the file alone', async () => {
    const store = new PortfolioStore(file);
    await store.load();
    await store.add(micron);
    const before = await readFile(file, 'utf8');

    await expect(store.update('missing', micron)).rejects.toThrow('No lot with id missing');
    await expect(store.remove('missing')).rejects.toThrow();
    expect(await readFile(file, 'utf8')).toBe(before);
  });

  it('keeps every lot when many saves happen at once', async () => {
    const store = new PortfolioStore(file);
    await store.load();
    await Promise.all(Array.from({ length: 20 }, (_, i) => store.add({ ...micron, shares: i + 1 })));

    const reopened = new PortfolioStore(file);
    await reopened.load();
    expect(reopened.list()).toHaveLength(20);
  });

  it('leaves no temporary files behind', async () => {
    const store = new PortfolioStore(file);
    await store.load();
    await store.add(micron);
    await store.add(micron);
    expect(await readdir(dir)).toEqual(['portfolio.json']);
  });

  it('keeps memory in step with disk when a save fails', async () => {
    const failingWrite = async () => {
      throw new Error('disk full');
    };
    const store = new PortfolioStore(file, failingWrite);
    await store.load();

    await expect(store.add(micron)).rejects.toThrow('disk full');
    expect(store.list()).toEqual([]);
  });

  it('saves alert settings per ticker', async () => {
    const store = new PortfolioStore(file);
    await store.load();
    const settings = { dayMovePct: 3, gainPct: 20, lossPct: null, earnings: true, news: false };
    expect(await store.setAlerts('MU', settings)).toEqual({ MU: settings });

    const reopened = new PortfolioStore(file);
    await reopened.load();
    expect(reopened.alerts()).toEqual({ MU: settings });
  });

  it('upgrades a version 1 file and keeps a backup of the original', async () => {
    const v1 = JSON.stringify({
      version: 1,
      lots: [{ id: 'old', ticker: 'MU', shares: 0.2, buyPrice: 692.84, boughtAt: '2026-11-05T18:23:00.000Z' }],
    });
    await writeFile(file, v1);

    const store = new PortfolioStore(file);
    await store.load();
    const [lot] = store.list();
    expect(lot).not.toHaveProperty('boughtAt');
    expect(lot.boughtOn).toMatch(/^2026-11-0[45]$/); // depends on the time zone the test runs in

    const saved = JSON.parse(await readFile(file, 'utf8'));
    expect(saved.version).toBe(3);
    expect(saved.alerts).toEqual({});
    expect(await readFile(join(dir, 'portfolio.json.v1-backup'), 'utf8')).toBe(v1);
  });

  it('moves an unreadable file aside instead of overwriting it', async () => {
    await writeFile(file, '{ this is not json');
    const store = new PortfolioStore(file);
    await store.load();

    expect(store.list()).toEqual([]);
    const files = await readdir(dir);
    const aside = files.find((name) => name.startsWith('portfolio.json.unreadable-'));
    expect(aside).toBeDefined();
    expect(await readFile(join(dir, aside as string), 'utf8')).toBe('{ this is not json');
  });
});

describe('writeFileAtomic', () => {
  it('replaces the contents of an existing file', async () => {
    await writeFile(file, 'old');
    await writeFileAtomic(file, 'new');
    expect(await readFile(file, 'utf8')).toBe('new');
  });

  it('cleans up the temporary file when the final rename fails', async () => {
    // Renaming a file over a folder fails, which stands in for a failed save.
    const target = join(dir, 'folder');
    await mkdir(target);
    await expect(writeFileAtomic(target, 'data')).rejects.toThrow();
    expect(await readdir(dir)).toEqual(['folder']);
  });
});
