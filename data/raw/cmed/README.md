# Tabela de preços CMED (Anvisa)

**Lista de preços de medicamentos — preços fábrica (PF) e máximos ao consumidor (PMC)**, publicada pela Secretaria Executiva da CMED em **09/10/2026 17h30**.
Origem: portal da Anvisa (CMED › Preços de medicamentos). Arquivo original: `lista_PMC__20261009_115232671.xlsx`.

| Arquivo | Conteúdo | SHA-256 do original (.xlsx) |
|---|---|---|
| `lista_PMC_20261009.csv.gz` | Aba "Lista PMC" convertida para CSV (26.635 apresentações), comprimida | `5febea16f9d08f2dbdcf15e954a05b762a7650e834d050c4d57b2dcb4b448fa3` |

O `.xlsx` original (12 MB) não está no repositório: o CSV tem o mesmo conteúdo da aba de preços. Para refazer a conversão:

```bash
python3 -I apps/api/scripts/cmedXlsxToCsv.py lista_PMC.xlsx xl/worksheets/sheet2.xml saida.csv
```

(só biblioteca padrão do Python; a aba "Lista PMC" é a `sheet2`).

## O que a CMED traz e como usamos

- **REGISTRO** (13 dígitos): os **9 primeiros** são o número de registro do cadastro de medicamentos da Anvisa (`NU_REGISTRO_PRODUTO`). É assim que cruzamos.
- **PMC** por alíquota de ICMS (`PMC 18 %`, `PMC 20 %`…): usamos **18%** por padrão (`CMED_ICMS`). É um valor de referência, **não o preço da Pague Menos**.
- **EAN 1/2/3**: códigos de barras da apresentação (úteis para achar imagens).
- **TARJA**: `Tarja Sem Tarja`, `Tarja Vermelha`, `Tarja Vermelha sob restrição`, `Tarja Preta`, ou `- (*)` (não informada).

Conferência feita com o cadastro da Anvisa (milhares de produtos cruzados): `CO_TARJA` 1 = Sem tarja · 2 = Vermelha · 3 = Vermelha sob restrição · 4 = Preta.

## Regra de segurança que usa a CMED

Um remédio só é tratado como "sem receita" se **a Anvisa (tarja 1) e a CMED (Sem Tarja) concordarem**. Qualquer divergência ou tarja não informada vira "exige receita".

## Atenção

- A CMED regula o **preço máximo**; a farmácia pode vender por menos. Na demonstração, o preço exibido é o PMC, identificado como tal.
- Cada registro tem várias apresentações (tamanhos). O catálogo usa a de **menor PMC** e mostra qual é.
- Confirme a licença e os termos de uso no portal antes de usar além do hackathon.
