import { useState, type FormEvent } from 'react';
import { copy } from '../../copy';

/** Filtro generativo: a pessoa descreve o que quer e a IA transforma em filtros visíveis e editáveis. */
export function AiFilterBar({ onSubmit, pending, id = 'ai-filter' }: { onSubmit: (text: string) => void; pending: boolean; id?: string }) {
  const t = copy.catalog;
  const [text, setText] = useState('');
  function submit(e: FormEvent) {
    e.preventDefault();
    const v = text.trim();
    if (!v || pending) return;
    onSubmit(v);
    setText('');
  }
  return (
    <form className="ai-bar" onSubmit={submit}>
      <label htmlFor={id} className="ai-bar__label">
        <span className="ai-bar__spark" aria-hidden="true">
          ✦
        </span>{' '}
        {t.aiLabel}
      </label>
      <div className="ai-bar__row">
        <input id={id} className="field" type="text" autoComplete="off" placeholder={t.aiPlaceholder} value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="btn btn--primary" aria-disabled={pending || !text.trim()}>
          {t.aiButton}
        </button>
      </div>
      <p className="hint" role="status" aria-live="polite">
        {pending ? t.aiThinking : ''}
      </p>
    </form>
  );
}
