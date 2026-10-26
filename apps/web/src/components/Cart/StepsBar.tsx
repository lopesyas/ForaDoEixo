import { copy } from '../../copy';

/** "Passo 2 de 3": onde estou e quantos faltam. A etapa atual é dita em texto, não só destacada. */
export function StepsBar({ current }: { current: 1 | 2 | 3 }) {
  const t = copy.checkout;
  return (
    <nav aria-label={t.stepOf(current)} className="steps-bar">
      <p className="steps-bar__now">{t.stepOf(current)}</p>
      <ol className="steps-bar__list">
        {t.steps.map((label, i) => {
          const n = i + 1;
          const state = n < current ? 'done' : n === current ? 'now' : 'next';
          return (
            <li key={label} className={`steps-bar__item steps-bar__item--${state}`} aria-current={n === current ? 'step' : undefined}>
              <span className="steps-bar__num" aria-hidden="true">
                {state === 'done' ? '✓' : n}
              </span>
              {label}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
