import type { Action } from '@ia/shared';
import { useState } from 'react';
import { copy } from '../../copy';

/** Pergunta de múltipla escolha: marque todas que servem. Uma opção "exclusiva" (ex.: "Nenhum desses") desmarca as outras. */
export function MultiChoice({ actions, onSubmit }: { actions: Action[]; onSubmit: (selected: Action[]) => void }) {
  const t = copy.multi;
  const [selected, setSelected] = useState<string[]>([]);
  const canContinue = selected.length > 0;

  function toggle(action: Action) {
    setSelected((current) => {
      if (current.includes(action.id)) return current.filter((id) => id !== action.id);
      if (action.exclusive) return [action.id];
      const exclusiveIds = actions.filter((a) => a.exclusive).map((a) => a.id);
      return [...current.filter((id) => !exclusiveIds.includes(id)), action.id];
    });
  }

  function submit() {
    if (!canContinue) return;
    onSubmit(actions.filter((a) => selected.includes(a.id)));
  }

  return (
    <fieldset className="multi" aria-describedby="multi-hint">
      <legend className="visually-hidden">{t.hint}</legend>
      <div className="stack">
        {actions.map((a) => (
          <label key={a.id} className={`choice${selected.includes(a.id) ? ' choice--on' : ''}`}>
            <input type="checkbox" checked={selected.includes(a.id)} onChange={() => toggle(a)} />
            <span>{a.label}</span>
          </label>
        ))}
      </div>
      <p id="multi-hint" className="hint" aria-live="polite">
        {canContinue ? t.hint : t.needOne}
      </p>
      <button type="button" className="btn btn--primary btn--block" aria-disabled={!canContinue} onClick={submit}>
        {t.next}
      </button>
    </fieldset>
  );
}
