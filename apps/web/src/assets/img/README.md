# Imagens da loja

Coloque os arquivos nesta pasta com o **nome do espaço** (webp, jpg, png ou svg). O espaço se preenche sozinho,
sem mudar código. Enquanto não houver arquivo, a loja mostra um bloco cinza com o nome do espaço.

> Use apenas imagens que a equipe tem direito de usar. O desafio exige repositório privado e proíbe divulgar o material.

| Espaço (nome do arquivo) | Onde aparece | Tamanho sugerido |
|---|---|---|
| `logo` | Cabeçalho e rodapé | 240 × 80 (svg ou png transparente) |
| `topbanner` | Faixa de parceiro acima do cabeçalho | 1918 × 75 (já preenchido: `topbanner.png`) |
| `hero-1`, `hero-2`, `hero-3` | Banners principais da vitrine | ~1490 × 322 (`hero-1`, `hero-2` e `hero-3` já preenchidos) |
| `promo-1`, `promo-2` | Banners secundários (proporção 2:1; as atuais têm ~440 px de largura) | 880 × 440 |
| `cat-emagrecedores`, `cat-skincare`, `cat-whey`, `cat-azia`, `cat-protetor-facial`, `cat-especiais` | "Navegue por categoria" | 460 × 306 (proporção 3:2; as atuais têm ~230 × 152 e ficam um pouco suaves em tela larga) |
| `service-saude`, `service-vacinas`, `service-ouro` | "Serviços Pague Menos" (a arte já traz título e seta) | ~990 × 540 |
| `brand-dauf`, `brand-pm`, `brand-eco`, `brand-amoravel`, `brand-ativday`, `brand-powervita` | "Nossas marcas" (a arte já traz o nome e o "Ver mais"; atuais ~233 × 204) | 466 × 408 |
| `catalog-banner-1` … `catalog-banner-4` | Carrossel de banners no topo de todas as categorias (já preenchidos; para incluir mais, adicione o espaço em `CatalogPage.tsx`) | ~886 × 101 (proporção 8,8:1) |
| `help-agent` | Banner "Está com problemas?" (atual: 431 × 405 com fundo próprio; o ideal é um PNG recortado, sem fundo) | 860 × 810 |
| `categories/<categoria>` | Foto ILUSTRATIVA (sem marca) usada quando o produto não tem foto própria. Veja a lista de 21 categorias em `docs/fotos-de-produtos.md` | 800 × 800 (1:1), fundo branco |
| `products/<id-do-produto>` | Foto de cada produto (ex.: `products/cos-25351…`) | 400 × 400 |

Sem foto do produto, a loja usa uma ilustração genérica (sem marca).
