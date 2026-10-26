import type { Action, UiTurn } from '@ia/shared';
import { useState } from 'react';
import { copy } from '../../copy';
import { ProductCardView } from './ProductCardView';

type OptionsTurn = Extract<UiTurn, { kind: 'OPTIONS' }>;

interface Props {
  turn: OptionsTurn;
  interactive: boolean;
  /** Ação genérica: o motor decide o que fazer com "compare:p1,p2" ou "choose:p1". */
  onAction: (action: Action) => void;
}

const MAX_COMPARE = 2;

export function OptionsView({ turn, interactive, onAction }: Props) {
  const t = copy.options;
  const [marked, setMarked] = useState<string[]>([]);
  const canCompare = interactive && turn.comparable && turn.products.length >= MAX_COMPARE;
  const full = marked.length >= MAX_COMPARE;

  function toggle(id: string) {
    setMarked((m) => (m.includes(id) ? m.filter((x) => x !== id) : m.length < MAX_COMPARE ? [...m, id] : m));
  }

  function compare() {
    if (!full) return;
    onAction({ id: `compare:${marked.join(',')}`, label: t.compareBoth, tone: 'primary' });
  }

  const single = interactive && turn.comparable && turn.products.length === 1;
  const hint = full ? t.ready : t.needTwo;

  return (
    <div className="wide">
      <div className="products">
        {turn.products.map((p) => (
          <ProductCardView
            key={p.id}
            product={p}
            compare={canCompare ? { checked: marked.includes(p.id), disabled: full, onToggle: () => toggle(p.id) } : undefined}
            onChoose={single ? () => onAction({ id: `choose:${p.id}`, label: `${t.choose} ${p.name}`, tone: 'secondary' }) : undefined}
          />
        ))}
      </div>

      {canCompare && (
        <div className="options-actions">
          <p id="compare-hint" className="hint" aria-live="polite">
            {hint}
            {full && turn.products.length > MAX_COMPARE ? ` ${t.maxTwo}` : ''}
          </p>
          <button type="button" className="btn btn--primary btn--block" aria-disabled={!full} aria-describedby="compare-hint" onClick={compare}>
            {t.compareBoth}
          </button>
        </div>
      )}
      {interactive &&
        turn.actions.map((a) => (
          <button key={a.id} type="button" className={a.tone === 'primary' ? 'btn btn--primary btn--block' : 'link-btn'} onClick={() => onAction(a)}>
            {a.label}
          </button>
        ))}
    </div>
  );
}
