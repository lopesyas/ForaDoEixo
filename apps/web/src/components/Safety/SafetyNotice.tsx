import type { Action, UiTurn } from '@ia/shared';
import { copy } from '../../copy';

type SafetyTurn = Extract<UiTurn, { kind: 'SAFETY_NOTICE' }>;

/** Cada nível tem forma, palavra e peso próprios: o aviso nunca depende só de cor. */
function Icon({ level }: { level: SafetyTurn['level'] }) {
  const common = { className: 'notice__icon', viewBox: '0 0 32 32', 'aria-hidden': true, focusable: false } as const;
  if (level === 'yellow')
    return (
      <svg {...common}>
        <path d="M16 3 30 28H2z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
        <path d="M16 12v8M16 23.5v.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  if (level === 'red')
    return (
      <svg {...common}>
        <path d="M11 3h10l8 8v10l-8 8H11l-8-8V11z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
        <path d="M9 16h14" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      </svg>
    );
  return (
    <svg {...common}>
      <circle cx="16" cy="16" r="13" fill="currentColor" />
      <path d="M16 8v10M16 22v.5" stroke="var(--color-danger-bg)" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Aviso de segurança. Por desenho, esta tela nunca mostra preço nem botão de compra:
 * o contrato desse tipo de turno nem tem campo de produto.
 */
export function SafetyNotice({ turn, interactive, onAction }: { turn: SafetyTurn; interactive: boolean; onAction: (a: Action) => void }) {
  const t = copy.safety;
  return (
    <div className="wide">
      <section className={`notice notice--${turn.level}`} role={turn.level === 'alert' ? 'alert' : undefined} aria-label={t[turn.level]}>
        <p className="notice__title">
          <Icon level={turn.level} />
          {t[turn.level]}
        </p>
        <p className="notice__text">{turn.text}</p>
        <details className="notice__why">
          <summary>{t.why}</summary>
          <p>{turn.why}</p>
        </details>
        {interactive && turn.actions.length > 0 && (
          <div className="stack">
            {turn.actions.map((a) => (
              <button key={a.id} type="button" className={`btn btn--block${a.tone === 'primary' ? ' btn--primary' : ''}`} onClick={() => onAction(a)}>
                {a.label}
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
