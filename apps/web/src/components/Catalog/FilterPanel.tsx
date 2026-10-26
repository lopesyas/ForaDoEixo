import type { Facets, FilterState } from '@ia/shared';
import type { ReactNode } from 'react';
import { copy } from '../../copy';
import { formatBRL } from '../../lib/format';

const PRICE_STEPS = [1000, 2000, 3000, 5000, 10000];

interface Props {
  filters: FilterState;
  facets: Facets;
  onChange: (patch: Partial<FilterState>) => void;
}

/** Filtros manuais (para quem prefere): tudo com rótulo de texto, alvos grandes e sem depender de cor. */
export function FilterPanel({ filters, facets, onChange }: Props) {
  const t = copy.catalog;
  const group = (title: string, body: ReactNode, open = false) => (
    <details className="facet" open={open}>
      <summary className="facet__title">
        <span>{title}</span>
        <span className="facet__chev" aria-hidden="true">
          ▾
        </span>
      </summary>
      <div className="facet__body">{body}</div>
    </details>
  );
  return (
    <div className="facets">
      {group(
        t.maxPrice,
        <fieldset className="filters__group">
          <legend className="visually-hidden">{t.maxPrice}</legend>
          <label className="filters__option">
            <input type="radio" name="max" checked={!filters.maxCents} onChange={() => onChange({ maxCents: undefined })} /> {t.anyPrice}
          </label>
          {PRICE_STEPS.filter((s) => s <= Math.max(facets.priceMaxCents, 1000) * 1.5).map((s) => (
            <label key={s} className="filters__option">
              <input type="radio" name="max" checked={filters.maxCents === s} onChange={() => onChange({ maxCents: s })} /> até {formatBRL(s)}
            </label>
          ))}
        </fieldset>,
        true,
      )}

      {facets.skinTypes.length > 0 &&
        group(
          t.skin,
          <fieldset className="filters__group">
            <legend className="visually-hidden">{t.skin}</legend>
            <label className="filters__option">
              <input type="radio" name="skin" checked={!filters.skin} onChange={() => onChange({ skin: undefined })} /> Qualquer
            </label>
            {facets.skinTypes.map((s) => (
              <label key={s.name} className="filters__option">
                <input type="radio" name="skin" checked={filters.skin === s.name} onChange={() => onChange({ skin: s.name })} /> {s.name === 'sensivel' ? 'sensível' : s.name} ({s.count})
              </label>
            ))}
          </fieldset>,
        )}

      {facets.companies.length > 1 &&
        group(
          t.company,
          <div className="filters__group">
            <label htmlFor="f-company" className="visually-hidden">
              {t.company}
            </label>
            <select id="f-company" className="field" value={filters.company ?? ''} onChange={(e) => onChange({ company: e.target.value || undefined })}>
              <option value="">{t.anyCompany}</option>
              {facets.companies.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.count})
                </option>
              ))}
            </select>
          </div>,
        )}

      {facets.categories.length > 1 &&
        group(
          t.categories,
          <fieldset className="filters__group">
            <legend className="visually-hidden">{t.categories}</legend>
            {facets.categories.map((c) => {
              const on = filters.cat.length === 0 || filters.cat.includes(c.key);
              return (
                <label key={c.key} className="filters__option">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => {
                      const all = facets.categories.map((x) => x.key);
                      const current = filters.cat.length === 0 ? all : filters.cat;
                      const next = current.includes(c.key) ? current.filter((k) => k !== c.key) : [...current, c.key];
                      if (next.length > 0) onChange({ cat: next }); // nunca deixa sem nenhuma categoria marcada
                    }}
                  />{' '}
                  {c.label} ({c.count})
                </label>
              );
            })}
          </fieldset>,
        )}
    </div>
  );
}
