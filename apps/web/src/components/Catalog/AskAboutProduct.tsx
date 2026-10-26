import type { ProductAnswer, ProductDetail } from '@ia/shared';
import { useState, type FormEvent } from 'react';
import type { StoreClient } from '../../api/store';
import { copy } from '../../copy';

/**
 * Perguntas sobre UM produto, na própria página dele. A resposta sai dos dados do cadastro (e a IA só redige, verificada).
 * Pergunta pessoal ("posso usar com pressão alta?") não é respondida de memória: leva à conferência de segurança.
 */
export function AskAboutProduct({ product, store, onCheck }: { product: ProductDetail; store: StoreClient; onCheck: () => void }) {
  const t = copy.product;
  const [text, setText] = useState('');
  const [answer, setAnswer] = useState<ProductAnswer | null>(null);
  const [asked, setAsked] = useState('');
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || pending) return;
    setAsked(q);
    setPending(true);
    setFailed(false);
    setAnswer(null);
    try {
      setAnswer(await store.ask(product.id, q));
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    void ask(text);
    setText('');
  }

  return (
    <section className="ask" aria-labelledby="ask-title">
      <h2 id="ask-title">
        <span aria-hidden="true">✦</span> {t.askTitle}
      </h2>
      <p className="hint">{t.askHint}</p>
      <ul className="chips">
        {product.questions.map((q) => (
          <li key={q}>
            <button type="button" className="chip" onClick={() => ask(q)}>
              {q}
            </button>
          </li>
        ))}
      </ul>
      <form className="ai-bar__row" onSubmit={submit}>
        <label htmlFor="ask-input" className="visually-hidden">
          {t.askPlaceholder}
        </label>
        <input id="ask-input" className="field" type="text" autoComplete="off" placeholder={t.askPlaceholder} value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="btn btn--primary" aria-disabled={pending || !text.trim()}>
          {t.askButton}
        </button>
      </form>
      <div role="status" aria-live="polite" className="ask__answer">
        {pending && <p className="hint">{t.asking}</p>}
        {failed && <p className="status">{t.error}</p>}
        {answer && (
          <div className="answer">
            <p className="answer__q">“{asked}”</p>
            <p className="answer__text">{answer.answer}</p>
            <p className="hint">{answer.mode === 'ai' ? t.modeAi : answer.mode === 'check' ? t.modeCheck : t.modeFacts}</p>
            {answer.basedOn.length > 0 && (
              <p className="hint">
                {t.basedOn}: {answer.basedOn.join(', ')}
              </p>
            )}
            {answer.mode === 'check' && (
              <button type="button" className="btn btn--primary" onClick={onCheck}>
                {t.check}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
