import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findApiKey } from './apiKey.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'portfolio-widget-env-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('findApiKey', () => {
  it('reads the key from a .env file', async () => {
    await writeFile(join(dir, '.env'), 'FINNHUB_API_KEY=abc123\n');
    expect(findApiKey([join(dir, '.env')], {})).toBe('abc123');
  });

  it('prefers a key already set in the environment', async () => {
    await writeFile(join(dir, '.env'), 'FINNHUB_API_KEY=from-file\n');
    expect(findApiKey([join(dir, '.env')], { FINNHUB_API_KEY: 'from-env' })).toBe('from-env');
  });

  it('skips missing files and files without a key', async () => {
    await writeFile(join(dir, 'empty.env'), 'OTHER=1\n');
    await writeFile(join(dir, 'second.env'), 'FINNHUB_API_KEY="quoted"\n');
    const files = [join(dir, 'missing.env'), join(dir, 'empty.env'), join(dir, 'second.env')];
    expect(findApiKey(files, {})).toBe('quoted');
  });

  it('returns null when there is no key anywhere', () => {
    expect(findApiKey([join(dir, 'missing.env')], {})).toBeNull();
  });
});
