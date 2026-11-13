import type { Theme } from '../shared/types';

const THEME_KEY = 'portfolio-widget:theme';

/** The theme I picked with the bulb button, or null if I never picked one. */
export function savedTheme(): Theme | null {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === 'light' || saved === 'dark' ? saved : null;
  } catch {
    return null;
  }
}

/** The theme on screen right now: my pick, or the system's when I have not picked. */
export function currentTheme(): Theme {
  return savedTheme() ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

/**
 * Puts a theme on the page and tells the main process, so the window's title
 * bar matches. null means "follow the system".
 */
export function applyTheme(theme: Theme | null): void {
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
  void window.portfolio.setTheme(theme ?? 'system');
}

export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Not remembered this time; the theme still changes now.
  }
}
