import type { Action, UiTurn } from '@ia/shared';
import { copy } from '../../copy';
import { keepUnits } from '../../lib/format';
import { ProductImage } from './ProductImage';

type CompareTurn = Extract<UiTurn, { kind: 'COMPARE' }>;

/**
 * Comparação lado a lado, só com as diferenças. O "✓" vem do dado (`better`), nunca é decidido aqui,
 * e sempre aparece junto de um texto para leitores de tela (não depende só de cor).
 */
export function CompareView({ turn, interactive, onAction }: { turn: CompareTurn; interactive: boolean; onAction: (a: Action) => void }) {
  const t = copy.options;
  const [a, b] = turn.products;
  const choose = turn.actions.filter((x) => x.id.startsWith('choose:'));
  const others = turn.actions.filter((x) => !x.id.startsWith('choose:'));

  return (
    <div className="wide compare">
      <div className="compare__cols compare__heads">
        {[a, b].map((p) => (
          <div key={p.id} className="compare__head">
            <ProductImage kind={p.image} id={p.id} category={p.categoryKey} />
            <strong>{keepUnits(p.name)}</strong>
          </div>
        ))}
      </div>

      <table className="compare__table">
        <caption className="visually-hidden">{t.tableCaption}</caption>
        <thead className="visually-hidden">
          <tr>
            <th scope="col">{t.feature}</th>
            <th scope="col">{a.name}</th>
            <th scope="col">{b.name}</th>
          </tr>
        </thead>
        <tbody>
          {turn.rows.map((row) => (
            <tr key={row.label} className="compare__row">
              <th scope="row">{row.label}</th>
              {row.values.map((value, i) => (
                <td key={i} className={row.better === i ? 'is-better' : undefined}>
                  {row.better === i && (
                    <span className="better-mark" aria-hidden="true">
                      ✓
                    </span>
                  )}
                  {value}
                  {row.better === i && <span className="visually-hidden"> ({t.better})</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="legend">{t.legend}</p>

      {interactive && (
        <>
          <div className="compare__cols">
            {choose.map((x) => (
              <button key={x.id} type="button" className="btn btn--block" onClick={() => onAction(x)}>
                {x.label}
              </button>
            ))}
          </div>
          {others.map((x) => (
            <button key={x.id} type="button" className="link-btn" onClick={() => onAction(x)}>
              {x.label}
            </button>
          ))}
        </>
      )}
    </div>
  );
}
