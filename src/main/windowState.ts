import { renameSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { writeFileAtomic } from './atomicWrite.js';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where the window was and whether it stays on top. Saved next to my data. */
export interface WindowState {
  bounds: Rect | null;
  alwaysOnTop: boolean;
}

const DEFAULT_STATE: WindowState = { bounds: null, alwaysOnTop: false };

// How much of the window has to be on a screen to count as visible: enough to grab the title bar.
const MIN_VISIBLE_WIDTH = 100;
const MIN_VISIBLE_HEIGHT = 50;

/**
 * The saved position if it is still on one of the screens, otherwise null so
 * the window opens in the default spot. Without this, unplugging an external
 * monitor could leave the widget opening somewhere I can never see.
 */
export function visibleBounds(saved: Rect | null, screens: Rect[]): Rect | null {
  if (!saved) return null;
  const onScreen = screens.some((area) => {
    const overlapWidth = Math.min(saved.x + saved.width, area.x + area.width) - Math.max(saved.x, area.x);
    const overlapHeight = Math.min(saved.y + saved.height, area.y + area.height) - Math.max(saved.y, area.y);
    return overlapWidth >= MIN_VISIBLE_WIDTH && overlapHeight >= MIN_VISIBLE_HEIGHT;
  });
  return onScreen ? saved : null;
}

export async function loadWindowState(file: string): Promise<WindowState> {
  try {
    const raw = JSON.parse(await readFile(file, 'utf8')) as Partial<WindowState>;
    return {
      bounds: isRect(raw.bounds) ? raw.bounds : null,
      alwaysOnTop: raw.alwaysOnTop === true,
    };
  } catch {
    // Missing or unreadable: open with the defaults. Nothing important is lost.
    return DEFAULT_STATE;
  }
}

export function saveWindowState(file: string, state: WindowState): Promise<void> {
  return writeFileAtomic(file, JSON.stringify(state, null, 2));
}

/**
 * The same atomic save, but finished before returning. Used while the app is
 * quitting, when an asynchronous write could be cut off before it completes.
 */
export function saveWindowStateNow(file: string, state: WindowState): void {
  const tempPath = `${file}.${process.pid}.tmp`;
  writeFileSync(tempPath, JSON.stringify(state, null, 2));
  renameSync(tempPath, file);
}

function isRect(value: unknown): value is Rect {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return ['x', 'y', 'width', 'height'].every((key) => typeof r[key] === 'number' && Number.isFinite(r[key]));
}
