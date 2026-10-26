import { useEffect, useState } from 'react';
import { copy } from '../copy';
import { TEXT_STEPS, applyPreferences, loadPreferences, savePreferences } from './preferences';
import { useReadAloud } from './useSpeech';

function readableText(id: string): string {
  const el = document.getElementById(id);
  return el?.innerText || el?.textContent || '';
}

/** Ajustes de leitura sempre visíveis. A preferência é lembrada: o usuário não precisa ajustar de novo. */
export function AccessibilityBar({ readTargetId }: { readTargetId: string }) {
  const [prefs, setPrefs] = useState(loadPreferences);
  const reader = useReadAloud();
  const [notice, setNotice] = useState('');
  const atMin = prefs.textStep === 0;
  const atMax = prefs.textStep === TEXT_STEPS.length - 1;

  /** Mudar o tamanho do texto sempre responde em palavras, inclusive quando já está no limite. */
  function changeStep(delta: 1 | -1) {
    const next = prefs.textStep + delta;
    if (next < 0 || next >= TEXT_STEPS.length) {
      setNotice(next < 0 ? copy.a11y.atMin : copy.a11y.atMax);
      return;
    }
    setPrefs((p) => ({ ...p, textStep: next }));
    setNotice(copy.a11y.level(next + 1, TEXT_STEPS.length));
  }

  useEffect(() => {
    applyPreferences(prefs);
    savePreferences(prefs);
  }, [prefs]);

  const t = copy.a11y;
  return (
    <div className="a11y-bar" role="group" aria-label={t.group}>
      <button
        type="button"
        className={`a11y-bar__btn${atMin ? ' a11y-bar__btn--limit' : ''}`}
        aria-label={t.smallerLabel}
        aria-disabled={atMin}
        onClick={() => changeStep(-1)}
      >
        <span>{t.smaller}</span>
        <Pips step={prefs.textStep} />
      </button>
      <button
        type="button"
        className={`a11y-bar__btn${atMax ? ' a11y-bar__btn--limit' : ''}`}
        aria-label={t.largerLabel}
        aria-disabled={atMax}
        onClick={() => changeStep(1)}
      >
        <span>{t.larger}</span>
        <Pips step={prefs.textStep} />
      </button>
      <button
        type="button"
        className="a11y-bar__btn"
        aria-pressed={prefs.highContrast}
        onClick={() => setPrefs((p) => ({ ...p, highContrast: !p.highContrast }))}
      >
        {t.contrast}
      </button>
      <button
        type="button"
        className="a11y-bar__btn"
        aria-pressed={reader.speaking}
        aria-label={reader.speaking ? t.stopLabel : t.listenLabel}
        hidden={!reader.supported}
        onClick={() => reader.toggle(readableText(readTargetId))}
      >
        {reader.speaking ? t.stop : t.listen}
      </button>
      <span className="visually-hidden" role="status">
        {notice}
      </span>
    </div>
  );
}

/** Quatro pontos mostram o tamanho atual do texto; o texto equivalente vai por aviso para leitores de tela. */
function Pips({ step }: { step: number }) {
  return (
    <span className="pips" aria-hidden="true">
      {TEXT_STEPS.map((_, i) => (
        <span key={i} className={i <= step ? 'pip pip--on' : 'pip'} />
      ))}
    </span>
  );
}
