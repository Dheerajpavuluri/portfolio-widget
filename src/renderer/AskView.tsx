import { useEffect, useState, type FormEvent } from 'react';
import type { CopilotAnswer, CopilotInfo, Digest, QuoteSnapshot } from '../shared/types';
import { errorMessage } from './format';

interface Props {
  /** Passed in so the digest refreshes when prices do. */
  snapshot: QuoteSnapshot | null;
  /** Used for the example questions. */
  tickers: string[];
}

/** The digest, plus a box to ask questions about my positions. */
export function AskView({ snapshot, tickers }: Props) {
  const [digest, setDigest] = useState<Digest | null>(null);
  const [info, setInfo] = useState<CopilotInfo | null>(null);
  const [question, setQuestion] = useState('');
  const [reply, setReply] = useState<CopilotAnswer | null>(null);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void window.portfolio.copilotInfo().then(setInfo);
  }, []);

  useEffect(() => {
    void window.portfolio.getDigest().then(setDigest);
  }, [snapshot]);

  async function ask(text: string) {
    setQuestion(text);
    setAsking(true);
    setError(null);
    setReply(null);
    try {
      setReply(await window.portfolio.ask(text));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setAsking(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (question.trim() !== '' && !asking) void ask(question);
  }

  const examples = ['What moved most today?', ...(tickers[0] ? [`How am I doing on ${tickers[0]}?`] : [])];

  return (
    <>
      {digest && (
        <section className="card digest">
          <h3>{digest.title}</h3>
          <ul>
            {digest.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="muted small">Built on this computer from your numbers. Nothing is sent anywhere.</p>
        </section>
      )}

      <section className="card ask">
        <form onSubmit={handleSubmit}>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              // Enter asks; Shift+Enter makes a new line.
              if (e.key === 'Enter' && !e.shiftKey) handleSubmit(e);
            }}
            placeholder="Ask about your positions. Name a ticker to send only that stock."
            rows={2}
            maxLength={500}
          />
          <div className="ask-actions">
            <div className="examples">
              {examples.map((example) => (
                <button key={example} type="button" className="link" disabled={asking} onClick={() => void ask(example)}>
                  {example}
                </button>
              ))}
            </div>
            <button type="submit" disabled={asking || question.trim() === ''}>
              {asking ? 'Asking...' : 'Ask'}
            </button>
          </div>
        </form>

        {info && (
          <p className="muted small model-line">
            Model: {info.label}.{' '}
            {info.where === 'local'
              ? 'Everything stays on this Mac.'
              : 'Your question and the data under "What was sent" go to Anthropic when you ask.'}
          </p>
        )}

        {error && (
          <p className="status-error" role="alert">
            {error}
          </p>
        )}

        {reply && (
          <div className="answer">
            <p>{reply.answer}</p>
            <details>
              <summary className="muted small">What was sent</summary>
              <pre>{reply.sent}</pre>
            </details>
          </div>
        )}
      </section>
    </>
  );
}
