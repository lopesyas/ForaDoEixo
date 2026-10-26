import { useState, type FormEvent } from 'react';
import { copy } from '../copy';
import { useDictation } from '../a11y/useSpeech';
import { TextRequest } from '../components/TextRequest/TextRequest';

interface Props {
  initialText?: string;
  onSubmit: (text: string) => void;
}

export function AssistantEntry({ initialText = '', onSubmit }: Props) {
  const [text, setText] = useState(initialText);
  const dictation = useDictation(setText);
  const t = copy.home;
  const canSearch = text.trim().length > 0;

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (canSearch) onSubmit(text.trim());
  }

  return (
    <>
      <div className="home">
        <form onSubmit={submit} noValidate className="home__main">
          <h1>{t.title}</h1>
          <p className="lead">{t.subtitle}</p>

          <TextRequest id="request" label={t.fieldLabel} value={text} placeholder={t.placeholder} describedBy="request-hint" onChange={setText} onSubmit={submit} />
          {/* Botão desabilitado explica por quê (Norman: restrições que guiam) */}
          <p id="request-hint" className="hint">
            {canSearch ? '' : t.needText}
          </p>

          <div className="row">
            <button type="submit" className="btn btn--primary" aria-disabled={!canSearch}>
              {t.search}
            </button>
            <button type="button" className="btn" onClick={() => dictation.toggle(text)} aria-pressed={dictation.listening} hidden={!dictation.supported}>
              {dictation.listening ? t.speakStop : t.speak}
            </button>
          </div>
          <p className="hint speech-status" role="status" aria-live="polite">
            {dictation.listening ? t.listening : dictation.error || (dictation.supported ? '' : t.speechUnavailable)}
          </p>
        </form>

        <div className="home__side">
          <section aria-labelledby="examples-title">
            <h2 id="examples-title" className="section-title">
              {t.examplesTitle}
            </h2>
            <div className="stack">
              {t.examples.map((example) => (
                <button key={example} type="button" className="btn btn--block btn--example" onClick={() => setText(example)}>
                  {example}
                </button>
              ))}
            </div>
          </section>

          <section className="panel" aria-labelledby="how-title">
            <h2 id="how-title" className="section-title">
              {t.howTitle}
            </h2>
            <ol className="steps">
              {t.howSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </>
  );
}
