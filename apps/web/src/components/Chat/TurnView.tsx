import type { Action, UiTurn } from '@ia/shared';
import { SafetyNotice } from '../Safety/SafetyNotice';
import { MultiChoice } from './MultiChoice';
import { CompareView } from '../Product/CompareView';
import { OptionsView } from '../Product/OptionsView';
import { Bubble } from './Bubble';

interface Props {
  turn: UiTurn;
  /** Só o último turno do assistente é interativo: menos opções na tela, menos memória exigida. */
  interactive: boolean;
  onAction: (action: Action) => void;
  onMulti: (actions: Action[]) => void;
}

function Actions({ actions, onAction, vertical }: { actions: Action[]; onAction: (a: Action) => void; vertical?: boolean }) {
  if (actions.length === 0) return null;
  return (
    <div className={vertical ? 'stack' : 'row'}>
      {actions.map((a) => (
        <button key={a.id} type="button" className={`btn btn--block${a.tone === 'primary' ? ' btn--primary' : ''}`} onClick={() => onAction(a)}>
          {a.label}
        </button>
      ))}
    </div>
  );
}

/** Renderiza o contrato de interface. Não decide nenhuma regra: só mostra o que a API mandou. */
export function TurnView({ turn, interactive, onAction, onMulti }: Props) {
  const actions = interactive ? turn.actions : [];

  switch (turn.kind) {
    case 'CONFIRM':
      return (
        <Bubble from="assistant">
          <p>{turn.text}</p>
          <ul className="facts">
            {turn.summary.map((item) => (
              <li key={item.label}>
                <span className="facts__label">{item.label}:</span> <strong>{item.value}</strong>
              </li>
            ))}
          </ul>
          <Actions actions={actions} onAction={onAction} />
        </Bubble>
      );

    case 'QUESTION':
      return (
        <Bubble from="assistant">
          <p>{turn.text}</p>
          {turn.multi ? (
            interactive && <MultiChoice actions={turn.actions} onSubmit={onMulti} />
          ) : (
            <Actions actions={actions} onAction={onAction} vertical />
          )}
        </Bubble>
      );

    case 'OPTIONS':
      return (
        <>
          <Bubble from="assistant">
            <p>{turn.text}</p>
          </Bubble>
          <OptionsView turn={turn} interactive={interactive} onAction={onAction} />
        </>
      );

    case 'COMPARE':
      return (
        <>
          <Bubble from="assistant">
            <p>{turn.text}</p>
          </Bubble>
          <CompareView turn={turn} interactive={interactive} onAction={onAction} />
        </>
      );

    case 'SAFETY_NOTICE':
      return <SafetyNotice turn={turn} interactive={interactive} onAction={onAction} />;

    case 'PARTIAL':
      return turn.products.length > 0 ? (
        <>
          <Bubble from="assistant">
            <p>{turn.text}</p>
          </Bubble>
          <OptionsView turn={{ kind: 'OPTIONS', text: turn.text, products: turn.products, actions: turn.actions, comparable: true }} interactive={interactive} onAction={onAction} />
        </>
      ) : (
        <Bubble from="assistant">
          <p>{turn.text}</p>
          <Actions actions={actions} onAction={onAction} />
        </Bubble>
      );

    case 'NOT_FOUND':
    case 'UNCONFIRMED':
      return (
        <Bubble from="assistant">
          <p>{turn.text}</p>
          <Actions actions={actions} onAction={onAction} />
        </Bubble>
      );
  }
}
