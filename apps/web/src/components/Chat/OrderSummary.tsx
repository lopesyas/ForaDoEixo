import type { UiTurn } from '@ia/shared';
import { copy } from '../../copy';

type Summary = Extract<UiTurn, { kind: 'CONFIRM' }>['summary'];

/** "Seu pedido": no celular fica fixo no topo; em telas largas vira um painel ao lado. */
export function OrderSummary({ summary, onChange, compact = false }: { summary: Summary; onChange: () => void; compact?: boolean }) {
  const t = copy.conversation;
  // No painel (pouco espaço), o resumo é uma linha só que abre ao tocar: não rouba a altura da conversa.
  if (compact) {
    return (
      <aside className="summary summary--compact" aria-label={t.summaryTitle}>
        <details>
          <summary>
            <strong>{t.summaryTitle}:</strong> <span className="summary__line">{summary.map((i) => i.value).join(' · ')}</span>
          </summary>
          <ul className="summary__list">
            {summary.map((item) => (
              <li key={item.label}>
                <span className="facts__label">{item.label}:</span> <strong>{item.value}</strong>
              </li>
            ))}
          </ul>
          <button type="button" className="link-btn" onClick={onChange}>
            {t.changeOrder}
          </button>
        </details>
      </aside>
    );
  }
  return (
    <aside className="summary" aria-label={t.summaryTitle}>
      <h2 className="summary__title">{t.summaryTitle}</h2>
      <ul className="summary__list">
        {summary.map((item) => (
          <li key={item.label}>
            <span className="facts__label">{item.label}:</span> <strong>{item.value}</strong>
          </li>
        ))}
      </ul>
      <button type="button" className="link-btn" onClick={onChange}>
        {t.changeOrder}
      </button>
    </aside>
  );
}
