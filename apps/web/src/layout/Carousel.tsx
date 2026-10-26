import { useEffect, useRef, useState, type ReactNode } from 'react';
import { copy } from '../copy';

/** Carrossel sem rotação automática (quem lê devagar não perde nada): rolagem por botões rotulados, teclado e toque. */
export function Carousel({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  const track = useRef<HTMLDivElement>(null);
  // As setas só aparecem quando há o que rolar; se tudo cabe na linha, elas só atrapalhariam.
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const measure = () => setOverflowing(el.scrollWidth > el.clientWidth + 4);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children]);
  const scroll = (dir: 1 | -1) => track.current?.scrollBy({ left: dir * Math.max(240, track.current.clientWidth * 0.8), behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  return (
    <div className={`carousel ${className}`.trim()} role="group" aria-roledescription="carrossel" aria-label={label}>
      {overflowing && (
      <button type="button" className="carousel__btn carousel__btn--prev" onClick={() => scroll(-1)}>
        <span aria-hidden="true">←</span>
        <span className="visually-hidden">{copy.store.prev}</span>
      </button>
      )}
      <div className="carousel__track" ref={track} tabIndex={0} aria-label={label}>
        {children}
      </div>
      {overflowing && (
      <button type="button" className="carousel__btn carousel__btn--next" onClick={() => scroll(1)}>
        <span aria-hidden="true">→</span>
        <span className="visually-hidden">{copy.store.next}</span>
      </button>
      )}
    </div>
  );
}
