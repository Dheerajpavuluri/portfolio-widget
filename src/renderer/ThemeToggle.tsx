import { useState } from 'react';
import { applyTheme, currentTheme, saveTheme, type Theme } from './theme';

/** A lightbulb button: lit for the light theme, off for the dark one. Clicking flips it. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const next: Theme = theme === 'light' ? 'dark' : 'light';

  function toggle() {
    applyTheme(next);
    saveTheme(next);
    setTheme(next);
  }

  return (
    <button
      className={theme === 'light' ? 'theme-toggle lit' : 'theme-toggle'}
      onClick={toggle}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <path
          className="bulb-glass"
          d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2V17h5v-1.2c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3Z"
        />
        <path d="M9.5 20h5M10.5 22.5h3" />
      </svg>
    </button>
  );
}
