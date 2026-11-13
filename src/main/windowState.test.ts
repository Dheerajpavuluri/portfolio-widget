import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadWindowState, saveWindowState, saveWindowStateNow, visibleBounds } from './windowState.js';

const laptop = { x: 0, y: 0, width: 1440, height: 900 };
const monitor = { x: 1440, y: 0, width: 2560, height: 1440 };

describe('visibleBounds', () => {
  it('keeps a position that is on a screen', () => {
    const saved = { x: 1900, y: 100, width: 440, height: 720 };
    expect(visibleBounds(saved, [laptop, monitor])).toEqual(saved);
  });

  it('drops a position on a monitor that is no longer connected', () => {
    expect(visibleBounds({ x: 1900, y: 100, width: 440, height: 720 }, [laptop])).toBeNull();
  });

  it('drops a position that only shows a sliver on screen', () => {
    expect(visibleBounds({ x: 1400, y: 100, width: 440, height: 720 }, [laptop])).toBeNull(); // 40px visible
    expect(visibleBounds({ x: 1300, y: 100, width: 440, height: 720 }, [laptop])).not.toBeNull(); // 140px
  });

  it('has nothing to restore the first time', () => {
    expect(visibleBounds(null, [laptop])).toBeNull();
  });
});

describe('loadWindowState and saveWindowState', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'portfolio-widget-window-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('round-trips the state', async () => {
    const file = join(dir, 'window.json');
    const state = { bounds: { x: 10, y: 20, width: 440, height: 720 }, alwaysOnTop: true };
    await saveWindowState(file, state);
    expect(await loadWindowState(file)).toEqual(state);
  });

  it('saves synchronously while quitting, leaving no temporary file', async () => {
    const file = join(dir, 'window.json');
    const state = { bounds: { x: 1, y: 2, width: 440, height: 720 }, alwaysOnTop: false };
    saveWindowStateNow(file, state);
    expect(await loadWindowState(file)).toEqual(state);
    expect(await readdir(dir)).toEqual(['window.json']);
  });

  it('falls back to defaults for a missing or broken file', async () => {
    expect(await loadWindowState(join(dir, 'missing.json'))).toEqual({ bounds: null, alwaysOnTop: false });
    await writeFile(join(dir, 'broken.json'), '{ nope');
    expect(await loadWindowState(join(dir, 'broken.json'))).toEqual({ bounds: null, alwaysOnTop: false });
    await writeFile(join(dir, 'odd.json'), JSON.stringify({ bounds: { x: 'a' }, alwaysOnTop: 'yes' }));
    expect(await loadWindowState(join(dir, 'odd.json'))).toEqual({ bounds: null, alwaysOnTop: false });
  });
});
