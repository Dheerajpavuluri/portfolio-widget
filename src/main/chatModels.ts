/**
 * The one interface the copilot talks to. Ollama (on this Mac) and Claude
 * (Anthropic's API) both implement it, so the rest of the app does not care
 * which one is answering.
 */
export interface ChatModel {
  /** Shown in the window, e.g. "llama3.2 via Ollama on this Mac". */
  label: string;
  /** Whether my data leaves the machine when I ask. */
  where: 'local' | 'cloud';
  ask(system: string, question: string): Promise<string>;
}

/** A problem I can fix myself, such as Ollama not running. The message says how. */
export class ModelUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelUnavailable';
  }
}

const OLLAMA_URL = 'http://127.0.0.1:11434';

export function createOllama(model: string, fetchFn: typeof fetch = fetch): ChatModel {
  return {
    label: `${model} via Ollama on this Mac`,
    where: 'local',
    async ask(system, question) {
      let response: Response;
      try {
        response = await fetchFn(`${OLLAMA_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            stream: false,
            // Low temperature: answers should stick to the numbers, not get creative.
            options: { temperature: 0.2 },
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: question },
            ],
          }),
          // Small models on a laptop can take a while to load the first time.
          signal: AbortSignal.timeout(120_000),
        });
      } catch {
        throw new ModelUnavailable(
          `Ollama is not running on this Mac. Install it from ollama.com, then run "ollama pull ${model}" in Terminal.`,
        );
      }

      if (response.status === 404) {
        throw new ModelUnavailable(`Ollama does not have the model ${model} yet. Run "ollama pull ${model}" in Terminal.`);
      }
      if (!response.ok) throw new Error(`Ollama returned an error (${response.status}).`);

      const json = (await response.json()) as { message?: { content?: unknown } };
      const text = json.message?.content;
      if (typeof text !== 'string' || text.trim() === '') throw new Error('Ollama sent an empty answer.');
      return text.trim();
    },
  };
}

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

export function createClaude(apiKey: string, model: string, fetchFn: typeof fetch = fetch): ChatModel {
  return {
    label: `${model} via the Anthropic API`,
    where: 'cloud',
    async ask(system, question) {
      let response: Response;
      try {
        response = await fetchFn(ANTHROPIC_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({ model, max_tokens: 600, system, messages: [{ role: 'user', content: question }] }),
          signal: AbortSignal.timeout(60_000),
        });
      } catch {
        throw new ModelUnavailable('Could not reach the Anthropic API. Check the internet connection.');
      }

      if (response.status === 401) throw new ModelUnavailable('Anthropic rejected the API key in .env.');
      if (response.status === 429) throw new ModelUnavailable('Anthropic rate limit reached. Try again in a minute.');
      if (!response.ok) throw new Error(`The Anthropic API returned an error (${response.status}).`);

      // The answer comes back as a list of content blocks; the text blocks are the reply.
      const json = (await response.json()) as { content?: { type?: string; text?: unknown }[] };
      const text = (json.content ?? [])
        .filter((block) => block.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text)
        .join('\n')
        .trim();
      if (text === '') throw new Error('The Anthropic API sent an empty answer.');
      return text;
    },
  };
}
