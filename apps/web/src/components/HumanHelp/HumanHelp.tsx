import { copy } from '../../copy';

/** Saída de emergência (heurística 3 de Nielsen): sempre visível, em todas as telas. */
export function HumanHelp() {
  return (
    <button type="button" className="btn btn--block human-help">
      {copy.humanHelp}
    </button>
  );
}
