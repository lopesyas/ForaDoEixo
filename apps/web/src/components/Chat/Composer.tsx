import { useState } from 'react';
import { useDictation } from '../../a11y/useSpeech';
import { copy } from '../../copy';
import { TextRequest } from '../TextRequest/TextRequest';

export function Composer({ disabled, onSend }: { disabled: boolean; onSend: (text: string) => void }) {
  const [text, setText] = useState('');
  const dictation = useDictation(setText);
  const t = copy.conversation;
  const canSend = !disabled && text.trim().length > 0;

  function send() {
    if (!canSend) return;
    if (dictation.listening) dictation.toggle(); // enviar enquanto escuta: para o microfone, para não ditar no campo já limpo
    onSend(text.trim());
    setText('');
  }

  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <TextRequest id="composer" label={t.composerLabel} value={text} placeholder={t.composerPlaceholder} onChange={setText} onSubmit={send} />
      <div className="composer__buttons">
        <button type="submit" className="btn btn--primary" aria-disabled={!canSend}>
          {t.send}
        </button>
        {dictation.supported && (
          <button type="button" className={`btn${dictation.listening ? ' btn--listening' : ''}`} onClick={() => dictation.toggle(text)} aria-pressed={dictation.listening}>
            {dictation.listening ? copy.home.speakStop : copy.home.speak}
          </button>
        )}
      </div>
      <p className="hint speech-status" role="status" aria-live="polite">
        {dictation.listening ? copy.home.listening : dictation.error || (dictation.supported ? '' : copy.home.speechUnavailable)}
      </p>
    </form>
  );
}
