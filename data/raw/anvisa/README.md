# Dados brutos da Anvisa (dados abertos)

Arquivos originais, **comprimidos com gzip** (o conteúdo é idêntico ao baixado; só não ocupa 340 MB).
Origem: portal de dados abertos da Anvisa (`dados.anvisa.gov.br` › `dados` › `CONSULTAS` › `PRODUTOS`), arquivos modificados em 13/10/2026.

| Arquivo | Conteúdo | SHA-256 do original (descomprimido) |
|---|---|---|
| `TA_CONSULTA_COSMETICOS.CSV.gz` | Cadastro de cosméticos (1,2 milhão de linhas) | `fc8bca054f56840488aa54b019380f0488afdf9719a1e2fcfbc4873140b70612` |
| `TA_CONSULTA_MEDICAMENTOS.CSV.gz` | Cadastro de medicamentos (229 mil linhas) | `265d70ed13343db18d92f31d95e9c425c99b15203ec47d10b18c60ec116fcfc3` |

Formato: `;` como separador, aspas duplas, codificação Windows-1252.
O dicionário de dados fornecido (`docs/dados/…Alimentos.pdf`) é o de **Alimentos**; ele não descreve os campos de cosméticos nem de medicamentos.

## Como regenerar os catálogos de demonstração

```bash
node --import tsx apps/api/scripts/buildCosmeticsCatalog.ts   # -> apps/api/data/cosmetics.catalog.json
node --import tsx apps/api/scripts/buildMedicinesCatalog.ts    # -> apps/api/data/medicines.catalog.json
```

(Os scripts leem estes `.gz` por padrão. Defina `CATALOG_TODAY=AAAA-MM-DD` para fixar a data usada no filtro de validade.)

## Atenção

- São dados públicos, mas **confirme a licença e os termos de uso no portal** antes de usar além do hackathon.
- Preço, quantidade e estoque **não existem** nesses arquivos: nos catálogos eles são **simulados**.
- Contraindicações e interações **não existem** nesses arquivos: as do catálogo de medicamentos são uma curadoria de protótipo, por substância, que precisa de validação farmacêutica.
- Os códigos de tarja foram **inferidos** por amostras (1 = sem prescrição; 2 = com prescrição; 3 = com retenção de receita; 4 = tarja preta). Confirme na documentação de Medicamentos.
