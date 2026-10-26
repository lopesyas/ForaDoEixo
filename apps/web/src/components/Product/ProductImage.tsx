import type { ProductCard } from '@ia/shared';

/** Ilustração genérica (sem marca real). Decorativa: o nome do produto vem em texto ao lado. */
import { findImage } from '../ImageSlot/images';

/** Foto do produto (`products/<id>`); senão a foto ilustrativa da categoria (`categories/<categoria>`); senão a ilustração genérica abaixo. */
export function ProductImage({ kind = 'box', id, category }: { kind?: ProductCard['image']; id?: string; category?: string }) {
  const photo = id ? findImage(`products/${id}`) : undefined;
  if (photo) return <img className="product-image product-image--photo" src={photo} alt="" loading="lazy" />;
  // Sem foto do produto: foto ILUSTRATIVA da categoria (sem marca), em assets/img/categories/<categoria>.
  const generic = category ? findImage(`categories/${category}`) : undefined;
  if (generic) return <img className="product-image product-image--photo product-image--generic" src={generic} alt="" loading="lazy" />;
  const body = '#cfe0ff';
  const edge = '#0227cf';
  return (
    <svg className="product-image" viewBox="0 0 80 96" aria-hidden="true" focusable="false">
      {kind === 'tube' && (
        <>
          <rect x="26" y="8" width="28" height="12" rx="3" fill={edge} />
          <path d="M22 20h36l-4 66a6 6 0 0 1-6 6H32a6 6 0 0 1-6-6z" fill={body} stroke={edge} strokeWidth="3" />
          <rect x="32" y="42" width="16" height="16" rx="8" fill="#fff" stroke={edge} strokeWidth="2" />
        </>
      )}
      {kind === 'jar' && (
        <>
          <rect x="14" y="26" width="52" height="14" rx="5" fill={edge} />
          <path d="M16 40h48v38a8 8 0 0 1-8 8H24a8 8 0 0 1-8-8z" fill={body} stroke={edge} strokeWidth="3" />
          <rect x="28" y="52" width="24" height="16" rx="8" fill="#fff" stroke={edge} strokeWidth="2" />
        </>
      )}
      {kind === 'bottle' && (
        <>
          <rect x="30" y="6" width="20" height="12" rx="3" fill={edge} />
          <path d="M32 18h16v8l8 10v46a8 8 0 0 1-8 8H32a8 8 0 0 1-8-8V36l8-10z" fill={body} stroke={edge} strokeWidth="3" />
          <rect x="30" y="50" width="20" height="16" rx="8" fill="#fff" stroke={edge} strokeWidth="2" />
        </>
      )}
      {kind === 'box' && (
        <>
          <rect x="12" y="20" width="56" height="64" rx="6" fill={body} stroke={edge} strokeWidth="3" />
          <rect x="22" y="36" width="36" height="18" rx="9" fill="#fff" stroke={edge} strokeWidth="2" />
        </>
      )}
    </svg>
  );
}
