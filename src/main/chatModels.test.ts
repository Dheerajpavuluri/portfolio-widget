import { describe, expect, it } from 'vitest';
import { createClaude, createOllama, ModelUnavailable } from './chatModels.js';

type Call = { url: string; init: RequestInit };

function fakeFetch(status: number, body: unknown) {
  const calls: Call[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const unreachable = (async () => {
  throw new TypeError('fetch failed');
}) as unknown as typeof fetch;

describe('createOllama', () => {
  it('sends the system prompt and question to the local Ollama server', async () => {
    const { fn, calls } = fakeFetch(200, { message: { role: 'assistant', content: ' MU is up 6.1%. ' } });
    const model = createOllama('llama3.2', fn);

    expect(await model.ask('Use only this data.', 'How is MU?')).toBe('MU is up 6.1%.');
    expect(model.where).toBe('local');
    expect(calls[0].url).toBe('http://127.0.0.1:11434/api/chat');
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.model).toBe('llama3.2');
    expect(body.stream).toBe(false);
    expect(body.messages).toEqual([
      { role: 'system', content: 'Use only this data.' },
      { role: 'user', content: 'How is MU?' },
    ]);
  });

  it('explains how to fix it when Ollama is not running or the model is missing', async () => {
    await expect(createOllama('llama3.2', unreachable).ask('s', 'q')).rejects.toThrow(
      'Ollama is not running on this Mac. Install it from ollama.com, then run "ollama pull llama3.2" in Terminal.',
    );
    const missing = fakeFetch(404, { error: 'model "llama3.2" not found, try pulling it first' });
    await expect(createOllama('llama3.2', missing.fn).ask('s', 'q')).rejects.toBeInstanceOf(ModelUnavailable);
  });
});

describe('createClaude', () => {
  it('sends the key in a header and joins the text blocks of the reply', async () => {
    const { fn, calls } = fakeFetch(200, { content: [{ type: 'text', text: 'MU is your biggest position.' }] });
    const model = createClaude('sk-test', 'claude-haiku-5-5', fn);

    expect(await model.ask('Use only this data.', 'Biggest position?')).toBe('MU is your biggest position.');
    expect(model.where).toBe('cloud');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-test');
    expect(calls[0].url).not.toContain('sk-test');
    const body = JSON.parse(String(calls[0].init.body));
    expect(body).toMatchObject({ model: 'claude-haiku-5-5', system: 'Use only this data.' });
    expect(body.messages).toEqual([{ role: 'user', content: 'Biggest position?' }]);
  });

  it('reports a bad key and network failures clearly', async () => {
    const bad = fakeFetch(401, { error: { type: 'authentication_error' } });
    await expect(createClaude('x', 'm', bad.fn).ask('s', 'q')).rejects.toThrow('Anthropic rejected the API key in .env.');
    await expect(createClaude('x', 'm', unreachable).ask('s', 'q')).rejects.toBeInstanceOf(ModelUnavailable);
  });
});
