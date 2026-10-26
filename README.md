# IA Commerce — do prompt à compra, com autonomia e segurança

Protótipo de comércio conversacional para uma rede de farmácias, construído para o desafio **"IA Commerce: do prompt à compra"** (Hacka Business · Rec'n'Play 2026).

> **Todos os dados são públicos ou simulados.** Nenhum dado, sistema ou credencial da empresa foi usado. O repositório é privado, como o desafio exige.

## A ideia em uma frase

A IA **entende e explica**; **regras testadas decidem** o que pode ser sugerido. Segurança em saúde vive no servidor, não no prompt.

## O que o protótipo faz

- **Loja no formato do e-commerce**: vitrine, categorias, listagem com filtros, página do produto, carrinho e checkout simulado.
- **Assistente embutido** (painel que abre sobre qualquer página): descobre a necessidade com perguntas curtas, recomenda, compara e conduz até a cesta. Entende frases soltas ("minha cabeça está estourando há 2 dias, é para minha mãe").
- **IA generativa distribuída pela experiência**, sempre com guarda-corpos:
  - **Filtro por frase**: "hidratante para pele seca até R$ 20" vira chips de filtro visíveis e removíveis.
  - **Busca do cabeçalho** entendida pela IA: produto vai ao catálogo; saúde, receita e emergência vão à conversa.
  - **Perguntas sobre um produto**: respondidas só com os dados do cadastro daquele produto, com a origem da resposta dita na tela.
  - **"Esse produto é para mim?"**: roda a camada de segurança para aquele produto, com idade, condições e remédios em uso.
  - **Revisão do carrinho**: mesmo princípio ativo em dois produtos, dois anti-inflamatórios juntos, lembretes de segurança.
  - **Histórico com consentimento** (perfil de demonstração): reposição do que está acabando, modo Cuidador (perfil de quem é cuidado), remédio de uso contínuo que exige receita.
- **Voz**: ditado ao vivo no campo de mensagem e "Ouvir" (leitura em voz alta), com reserva de transcrição no servidor.
- **Acessibilidade e IHC** para o público 50+: texto a partir de 18 px, alvos de 48 px, contraste testado (WCAG AA), alto contraste, A−/A+, uma ação principal por tela, ícone sempre com rótulo, "Falar com atendente" sempre visível.

## Segurança em saúde (o ponto central)

| Camada | O que faz |
|---|---|
| **Triagem de emergência** (regras, sem IA) | Dor no peito, falta de ar, sinais de AVC, overdose, risco de se machucar: alerta imediato, antes de qualquer interpretação. |
| **Receita** | Remédio de receita nunca é sugerido, nem aparece botão de compra. Leva ao farmacêutico. |
| **Dupla checagem de tarja** | Só é "sem receita" se a **Anvisa e a tabela CMED concordarem**. Divergência vira "exige receita". |
| **Semáforo de regras** | Contraindicação, alergia, interação, gravidez, criança pequena, idoso, sintoma que persiste: cada regra tem id e motivo; vale sempre a mais grave. |
| **A IA não decide segurança** | Extrai a intenção e redige texto. Toda frase gerada passa por verificação (sem preço, número ou promessa de saúde que não esteja nos dados); se falhar, entra um texto fixo. |
| **Degradação segura** | Sem IA (limite, queda, sem chave), tudo continua funcionando por regras. |

> As regras clínicas são de **protótipo**, feitas a partir de fontes públicas e simplificadas. **Precisam de validação farmacêutica e revisão jurídica** antes de qualquer uso real. Os textos de segurança estão marcados como pendentes de revisão.

## Arquitetura

```
Navegador (React + Vite)                API (Node + Express + TypeScript)             Portas (interfaces)
────────────────────────                ─────────────────────────────────             ───────────────────
Loja, listagem, produto, carrinho  ───▶ Rotas finas + validação (Zod)        ───▶     CatalogPort   (hoje: JSON da Anvisa/CMED)
Painel do assistente                    Domínio puro: segurança, intenção              LlmPort       (hoje: qualquer provedor OpenAI-compatível)
Voz (Web Speech API)                    Serviços: conversa, catálogo, carrinho         Estoque/preço, carrinho, pagamento: simulados
                                        Contrato de interface tipado (packages/shared)
```

- **Monorepo TypeScript**: `apps/web`, `apps/api`, `packages/shared` (contratos Zod compartilhados).
- **Regra de dependência**: `domain/` não importa banco, rede nem IA. Dá para testar a segurança sem rede e trocar as fontes de dados sem tocar nas regras.
- **Contrato de interface**: a API devolve turnos tipados (`QUESTION`, `OPTIONS`, `COMPARE`, `SAFETY_NOTICE`, `NOT_FOUND`…); o front só renderiza. Toda resposta é validada nas duas pontas.
- **IA atrás de uma porta**: trocar de provedor é mudar três linhas do `.env`. Há cadeia de provedores com reserva automática, disjuntor e teto de chamadas.

### Do dado simulado ao dado real (integração proposta)

| Hoje (hackathon) | Em produção |
|---|---|
| Cadastro público da Anvisa (nome, empresa, princípio ativo, tarja) | API de catálogo da empresa, ligada ao cadastro da Anvisa |
| Preço: **PMC da tabela CMED** (teto regulado) para medicamentos; **simulado** para cosméticos | API de preços e promoções da empresa |
| Estoque simulado | API de estoque e disponibilidade por CEP |
| Contraindicações e interações: curadoria de protótipo por substância | Base clínica licenciada, validada por farmacêuticos |
| Perfil e histórico sintéticos (com consentimento simulado) | Conta do cliente, com consentimento (LGPD) |
| Carrinho no navegador; checkout simulado | API de carrinho e gateway de pagamento existentes |
| Provedor de IA gratuito | Provedor corporativo aprovado, com contrato e política de dados |

Cada linha é uma **porta com interface definida**: a troca da fonte não exige reescrever o núcleo.

## Dados e fontes

Veja `data/raw/anvisa/README.md` e `data/raw/cmed/README.md` (origem, SHA-256, como regenerar).

- **Anvisa (dados abertos)**: cadastro de cosméticos (1,2 milhão de linhas) e de medicamentos (229 mil). Tratados por scripts em `apps/api/scripts/` para os catálogos pequenos em `apps/api/data/`.
- **CMED**: lista de preços de 09/10/2026 (26.635 apresentações), cruzada pelos 9 primeiros dígitos do registro. O preço mostrado é o **preço máximo ao consumidor**, não o preço da rede.
- Preço de cosméticos, estoque e prazos: **simulados** e identificados como tais.

## Como rodar

```bash
npm install
cp .env.example .env        # opcional: preencha para ligar a IA (funciona sem)
npm run dev:all             # site em http://localhost:5173 e API em http://127.0.0.1:4100
```

```bash
npm test                    # contrato, API (regras, cenários, saúde) e interface (inclui acessibilidade com axe)
npm run typecheck
npm run ai:check            # testa a conexão com a IA (nunca imprime a chave)
```

### Publicar (site + API em um endereço só)

```bash
npm ci && npm run build     # gera apps/web/dist
HOST=0.0.0.0 npm run start  # a API serve o site e a API juntos (porta em PORT, padrão 4100)
```

Há um exemplo de configuração em `render.yaml`. Preencha as variáveis de IA no painel da hospedagem (não no repositório). Serviços gratuitos "dormem": abra o endereço alguns minutos antes de demonstrar.

## Qualidade

- **750+ testes de API e 130+ de interface**, incluindo:
  - tabela de casos de segurança e propriedades que não podem quebrar (receita nunca liberada; nenhum motivo restritivo termina em "liberado");
  - **varredura exaustiva de saúde**: mais de 5 mil combinações de sintoma, idade, tempo e condições conferidas por um oráculo independente;
  - **conversas aleatórias** com semente fixa (inclusive com uma IA hostil) verificando que nunca há beco sem saída, dose, preço inventado ou produto de receita;
  - acessibilidade automática (axe-core) em cada tela.
- Contraste de cores testado nos dois temas (padrão e alto contraste).

## Limites e premissas

- Regras clínicas simplificadas e textos de segurança **pendentes de validação farmacêutica e jurídica**.
- Preço de cosméticos, estoque, prazos e atendimento humano são **simulados**.
- Fotos de produtos: divulgação das marcas, apenas para esta demonstração (`apps/web/src/assets/img/products/README.md`). Substituir antes de qualquer uso público.
- Planos gratuitos de IA podem registrar o que é enviado: use frases de exemplo.
- Conversas ficam na memória do servidor (com teto) e não são guardadas em banco.
- Ainda não houve teste de usabilidade com pessoas 50+; o roteiro e a ficha de anotação estão previstos.

## Próximos passos (roadmap)

1. **Fase 1 — piloto no site**: categorias de cuidado e remédios sem receita, busca e filtros por frase, revisão do carrinho.
2. **Fase 2 — cuidado contínuo**: conta real, histórico e reposição com consentimento, modo Cuidador com perfis guardados.
3. **Fase 3 — outros canais**: WhatsApp e assistentes de IA externos reutilizando o mesmo motor (por exemplo, por servidor MCP); Libras e voz ampliadas.
