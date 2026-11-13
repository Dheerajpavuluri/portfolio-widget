import type { CopilotAnswer, CopilotInfo } from '../shared/types.js';
import { createClaude, createOllama, type ChatModel } from './chatModels.js';
import { buildContext, type PortfolioFacts } from './copilotContext.js';

const SYSTEM_PROMPT = [
  'You answer questions about my own stock portfolio.',
  'Use only the data given with the question. If it does not contain the answer, say so plainly instead of guessing.',
  'Quote the numbers as given, in dollars and percent. Keep answers under 120 words.',
  'Describe what the numbers show. Do not tell me to buy or sell; that decision is mine.',
].join(' ');

export const MAX_QUESTION_LENGTH = 500;

interface Settings {
  anthropicKey: string | null;
  anthropicModel: string | null;
  ollamaModel: string | null;
}

/** Ollama by default; Claude only when an Anthropic key is set. */
export function chooseModel({ anthropicKey, anthropicModel, ollamaModel }: Settings, fetchFn: typeof fetch = fetch): ChatModel {
  return anthropicKey
    ? createClaude(anthropicKey, anthropicModel ?? 'claude-haiku-5-5', fetchFn)
    : createOllama(ollamaModel ?? 'llama3.2', fetchFn);
}

/**
 * Answers one question at a time. Position data is only gathered and sent
 * when I ask, and only what that question needs (see buildContext).
 */
export class Copilot {
  constructor(
    private readonly model: ChatModel,
    private readonly facts: () => PortfolioFacts,
  ) {}

  info(): CopilotInfo {
    return { label: this.model.label, where: this.model.where };
  }

  async ask(question: string): Promise<CopilotAnswer> {
    const { text } = buildContext(question, this.facts());
    const answer = await this.model.ask(SYSTEM_PROMPT, `My data:\n${text}\n\nMy question: ${question}`);
    return { answer, sent: text };
  }
}
