import { copy } from '../copy';

/** Aviso de "adicionado à cesta" que fica até a pessoa dispensar (quem lê devagar não perde): sem sumir sozinho. */
export function AddedToast({ name, onView, onClose }: { name: string; onView: () => void; onClose: () => void }) {
  return (
    <div className="toast" role="status">
      <span>{copy.assistant.added(name)}</span>
      <button type="button" className="btn btn--primary" onClick={onView}>
        {copy.assistant.viewCart}
      </button>
      <button type="button" className="btn" onClick={onClose}>
        {copy.assistant.close}
      </button>
    </div>
  );
}
