import type { ReactNode } from 'react';
import { findImage } from './images';

interface Props {
  /** Nome do espaço = nome do arquivo em `src/assets/img/` (sem extensão). */
  slot: string;
  /** Descrição da imagem para leitores de tela. Obrigatória, a menos que seja decorativa. */
  alt: string;
  /** Proporção, ex.: "16 / 5". */
  ratio?: string;
  fit?: 'cover' | 'contain';
  /** Imagem que só enfeita (o texto ao lado já diz tudo): não é lida por leitores de tela. */
  decorative?: boolean;
  className?: string;
  /** O que mostrar enquanto não há imagem (padrão: um bloco discreto com o nome do espaço). */
  fallback?: ReactNode;
}

/** Espaço reservado para imagem: mostra a imagem real se o arquivo existir; senão, um bloco neutro com o nome do espaço. */
export function ImageSlot({ slot, alt, ratio = '16 / 9', fit = 'cover', decorative = false, className = '', fallback }: Props) {
  const url = findImage(slot);
  return (
    <div className={`slot slot--${fit}${url ? '' : ' slot--empty'} ${className}`.trim()} style={{ aspectRatio: ratio }} data-slot={slot}>
      {url ? (
        <img src={url} alt={decorative ? '' : alt} loading="lazy" />
      ) : (
        (fallback ?? (
          <span className="slot__label" aria-hidden="true">
            <span className="slot__icon">▣</span>
            {slot}
          </span>
        ))
      )}
    </div>
  );
}
