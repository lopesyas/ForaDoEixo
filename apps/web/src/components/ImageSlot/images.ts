/**
 * Imagens da loja. Para trocar um espaço reservado por uma imagem real, basta colocar o arquivo em
 * `src/assets/img/` com o NOME DO ESPAÇO (ex.: `hero-1.jpg`, `logo.svg`, `products/cos-123.webp`).
 * Aceita webp, jpg, png e svg. Nenhuma outra mudança é necessária: o espaço se preenche sozinho.
 * A lista de espaços e tamanhos recomendados está em `src/assets/img/README.md`.
 */
const files = import.meta.glob('../../assets/img/**/*.{webp,jpg,jpeg,png,svg}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

const index = new Map<string, string>();
for (const [path, url] of Object.entries(files)) {
  const name = path.replace('../../assets/img/', '').replace(/\.(webp|jpe?g|png|svg)$/i, '');
  index.set(name, url);
}

/** Há alguma foto de produto (assets/img/products)? Se houver, o rodapé cita a origem e a licença. */
export const hasProductPhotos = (): boolean => [...index.keys()].some((k) => k.startsWith('products/') && k !== 'products/attribution');

/** Há alguma foto ilustrativa de categoria (assets/img/categories)? Se houver, o rodapé avisa que são ilustrativas. */
export const hasCategoryPhotos = (): boolean => [...index.keys()].some((k) => k.startsWith('categories/'));

/** URL da imagem do espaço, ou undefined se ainda não foi colocada. */
export function findImage(slot: string): string | undefined {
  return index.get(slot);
}
