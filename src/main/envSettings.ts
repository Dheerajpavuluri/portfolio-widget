import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

/**
 * Finds the Finnhub API key. A FINNHUB_API_KEY already set in the environment
 * wins; otherwise the first .env file in `envFiles` that has one is used.
 * The key is only ever read here, in the main process.
 */
export function findApiKey(envFiles: string[], env: NodeJS.ProcessEnv = process.env): string | null {
  const fromEnvironment = env.FINNHUB_API_KEY?.trim();
  if (fromEnvironment) return fromEnvironment;

  for (const file of envFiles) {
    if (!existsSync(file)) continue;
    const key = parseEnv(readFileSync(file, 'utf8')).FINNHUB_API_KEY?.trim();
    if (key) return key;
  }
  return null;
}
