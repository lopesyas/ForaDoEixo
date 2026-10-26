/** Título de seção no padrão da loja: linha pequena em vermelho, título em negrito e filete. */
export function SectionTitle({ kicker, title, id }: { kicker: string; title: string; id: string }) {
  return (
    <div className="section-title2">
      <p className="section-title2__kicker">{kicker}</p>
      <h2 id={id} className="section-title2__title">
        {title}
      </h2>
    </div>
  );
}
