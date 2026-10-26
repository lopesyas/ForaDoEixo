# Fotos de produtos (busca automática com revisão)

Fonte: **Open Beauty Facts** e **Open Food Facts** (comunidade; licença CC BY-SA, com atribuição). Sem chave de API.

## Como usar

```bash
npm run images:find                      # 1. busca candidatos (produtos da demonstração) e gera data/images/review.html
npm run images:find -- --scope all --limit 200      # (opcional) catálogo inteiro
npm run images:find -- --ids cos-123,med-456        # (opcional) só alguns produtos

# 2. abra data/images/review.html, confira cada foto e clique em "Baixar approved.json".
#    Salve o arquivo em data/images/approved.json

npm run images:apply                     # 3. baixa só as aprovadas para apps/web/src/assets/img/products/<id>.jpg
```

Depois disso a loja já usa as fotos (o espaço `products/<id>` se preenche sozinho) e o rodapé passa a citar a licença.
A lista de fotos e de fontes fica em `apps/web/src/assets/img/products/ATTRIBUTION.md`.

## Regras de segurança do processo

- **Nada é aplicado sem aprovação.** O candidato mais forte só vem pré-marcado se o código de barras for igual ou o nome for muito parecido; você confirma ou troca.
- **Remédios só por código de barras (EAN da CMED).** Busca por nome poderia trazer outro produto, e foto errada em remédio é risco.
- **Cosméticos por nome e marca** (o cadastro de cosméticos da Anvisa não tem EAN), com nota de semelhança visível.
- O arquivo de aprovados só pode apontar para os domínios das fontes abertas, por https. Qualquer outro endereço é ignorado.
- O script se identifica, espera entre as chamadas (a busca por texto tem limite baixo) e não guarda nada fora do projeto.

## Limites

- A cobertura de produtos brasileiros nessas fontes é irregular: espere fotos para uma parte dos produtos. Os demais ficam com a ilustração genérica.
- Remédios raramente têm foto aberta.
- Confirme a licença e os termos no site de cada fonte antes de usar além do hackathon.

---

# Fotos ilustrativas por categoria (sem marca)

A loja usa, nesta ordem: **foto do produto** (`products/<id>`) → **foto ilustrativa da categoria** (`categories/<categoria>`) → ilustração genérica em SVG.
Quando há fotos de categoria, o rodapé avisa que as imagens de embalagem são ilustrativas (geradas por IA, sem marca).

Salve cada imagem em `apps/web/src/assets/img/categories/<categoria>.png` (ou `.jpg` / `.webp`), quadrada (800 × 800), com fundo branco.

## Prompt mestre (mantenha idêntico em todas; troque só o trecho entre colchetes)

> Professional minimalist studio product photography of a blank white [EMBALAGEM], no logos, no brand text, no labels with writing, clean aesthetic, centered, isolated on a pure white background, soft diffused lighting, subtle soft shadow under the object, photorealistic, square composition, eye-level angle

## As 21 categorias

| Arquivo (`categories/…`) | [EMBALAGEM] |
|---|---|
| `hidratante_facial` | minimalist round cosmetic jar with a silver line detail |
| `hidratante_corporal` | tall body lotion bottle with a pump dispenser |
| `protetor_solar` | flat squeezable cosmetic tube standing vertically on its cap |
| `shampoo` | sleek matte plastic cylindrical bottle with a pump dispenser |
| `condicionador` | matte plastic bottle with a flip-top cap (shorter and wider than the shampoo bottle) |
| `sabonete` | clear glass liquid soap dispenser bottle with a pump |
| `desodorante` | roll-on deodorant bottle |
| `creme_dental` | toothpaste tube standing on its cap |
| `repelente` | spray bottle with a trigger nozzle |
| `protetor_labial` | small lip balm stick tube |
| `perfume` | minimalist transparent rectangular glass perfume bottle with a chrome cap |
| `batom` | lipstick tube, closed, white casing |
| `esmalte` | small clear glass nail polish bottle with a white cap |
| `antisseptico` | translucent plastic hand sanitizer gel bottle with a flip-top cap |
| `analgesico` | medicine cardboard box next to a blister pack with pills |
| `antiacido` | tall cylindrical plastic tube for effervescent tablets |
| `antialergico` | medicine cardboard box next to a blister pack, with a thin blue stripe on the box |
| `expectorante` | amber glass liquid medicine bottle with a white screw cap |
| `garganta` | small plastic throat spray bottle with a thin nozzle |
| `sono` | amber glass dropper bottle with a rubber pipette |
| `receita` | medicine cardboard box with a thin red stripe, no text |

## Dicas para manter o estilo igual

- Gere tudo na mesma ferramenta, na mesma sessão, com o prompt mestre intacto.
- Se aparecer texto ou logotipo inventado na embalagem, gere de novo ou peça "no text on the packaging at all". Texto estranho em produto de saúde parece golpe.
- Confira os termos de uso da ferramenta quanto a uso em projetos, e guarde o nome dela e a data aqui, se for exigido.
