import { copy } from '../../copy';
import { findImage } from '../ImageSlot/images';

/** Aproximação do logo em SVG e texto (quadrado coral com cruz branca). Trocar pelo arquivo oficial quando houver autorização. */
export function Logo({ onDark = false }: { onDark?: boolean }) {
  // Logo oficial: coloque `logo.svg` (ou png/jpg) em src/assets/img/ e ele substitui esta aproximação.
  const official = findImage('logo');
  if (official) return <img className="logo__img" src={official} alt={copy.brand} />;
  return (
    <span className={`logo${onDark ? ' logo--dark' : ''}`} role="img" aria-label={copy.brand}>
      <svg className="logo__mark" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <rect width="48" height="48" rx="12" fill="var(--color-brand-accent)" />
        <path
          d="M19 9h10a3 3 0 0 1 3 3v7h7a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3h-7v7a3 3 0 0 1-3 3H19a3 3 0 0 1-3-3v-7H9a3 3 0 0 1-3-3v-4a3 3 0 0 1 3-3h7v-7a3 3 0 0 1 3-3z"
          fill="#fff"
        />
      </svg>
      <span className="logo__word" aria-hidden="true">
        <span>Pague</span>
        <span>Menos</span>
      </span>
    </span>
  );
}
