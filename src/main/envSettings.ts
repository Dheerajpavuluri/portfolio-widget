import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

/** The settings that can go in .env. Only the Finnhub key is required. */
export type SettingName = 'FINNHUB_API_KEY' | 'ANTHROPIC_API_KEY' | 'ANTHROPIC_MODEL' | 'OLLAMA_MODEL';

/**
 * Reads one setting, such as an API key. A value already set in the
 * environment wins; otherwise the first .env file in `envFiles` that has it
 * is used. Keys are only ever read here, in the main process.
 */
export function findSetting(name: SettingName, envFiles: string[], env: NodeJS.ProcessEnv = process.env): string | null {
  const fromEnvironment = env[name]?.trim();
  if (fromEnvironment) return fromEnvironment;

  for (const file of envFiles) {
    if (!existsSync(file)) continue;
    const value = parseEnv(readFileSync(file, 'utf8'))[name]?.trim();
    if (value) return value;
  }
  return null;
}
