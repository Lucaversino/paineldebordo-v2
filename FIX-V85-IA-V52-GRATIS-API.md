# V85 — PAINEL IA V52 FLUTUANTE, GRÁTIS E TESTE REAL DA OPENAI

## Objetivo

A V85 continua diretamente a V84. Não é um projeto novo.

A lógica e o estilo de resposta do assistente da V52 foram restaurados no Painel IA, mantendo a interface flutuante que já existia nas versões mais novas.

## IA sem créditos

A partir da V85:

- Painel IA é grátis para todos os usuários;
- pergunta simples = 0 créditos;
- análise completa = 0 créditos;
- análise avançada = 0 créditos;
- o saldo da carteira não é consultado antes de conversar com a IA;
- a resposta da IA não chama `debitCreditsAfterSuccess`;
- `free_ai_access` é mantido como `true` para todas as carteiras como proteção adicional;
- créditos continuam sendo usados pelo AIS normalmente;
- a conta administrativa mantém os 80 créditos da V84 para uso no AIS.

## Assistente V52 no botão flutuante

O botão flutuante continua no canto da tela e abre o Painel IA.

O assistente usa novamente as regras principais da V52:

- análise profunda da viagem;
- comparação de viagens;
- largadas, horários, profundidades e posições;
- captura principal, mistura e descarte;
- lua, vento, ondas, swell, corrente, nível do mar, temperatura e clorofila quando disponíveis;
- separação entre fato observado, padrão estatístico e hipótese operacional;
- resposta em português do Brasil;
- resumo, evidências, leitura operacional, próxima largada e confiança.

## Teste real da conexão OpenAI

Antes, o `GET /api/ai-assistant` podia informar que a API estava configurada apenas porque `OPENAI_API_KEY` existia.

Na V85 ele faz um teste real em servidor contra:

`GET https://api.openai.com/v1/models/{OPENAI_MODEL}`

O painel pode mostrar:

- `API CONECTADA`;
- `OPENAI_API_KEY não configurada`;
- chave recusada;
- modelo sem acesso/não encontrado;
- timeout de conexão.

Também existe o botão **Testar API** dentro da janela flutuante.

O Super Admin continua tendo o diagnóstico geral em **Admin → AIS, IA e Créditos → Testar APIs agora**.

## Diagnóstico observado na produção antes da V85

Na checagem da implantação atual na Vercel:

- `GET /api/ai-assistant` respondeu HTTP 200;
- `POST /api/ai-assistant` registrou HTTP 502 em uma tentativa recente;
- os erros agregados da Vercel mostraram muitos timeouts de funções;
- também apareceram falhas `CONNECTION_CLOSED` e `statement timeout` ligadas ao pooler do Supabase;
- portanto o erro da IA não podia ser atribuído somente à chave OpenAI.

A V85 melhora esse ponto: a montagem do contexto do banco é isolada. Se o Supabase falhar, a rota registra o problema e ainda tenta chamar a OpenAI com o contexto que estiver disponível.

## Timeouts

- teste da chave/modelo: 6 segundos;
- chamada OpenAI: até 55 segundos no servidor;
- chamada POST no navegador: até 65 segundos;
- função Next.js: `maxDuration = 60`.

Isso evita o antigo timeout do navegador antes do servidor concluir a resposta.

## Variáveis necessárias

Na Vercel:

```text
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.6-sol
OPENAI_REASONING_EFFORT=high
```

A chave permanece somente no servidor e não é enviada ao navegador.

## Arquivos principais alterados

- `components/FloatingPanelAssistant.tsx`
- `app/api/ai-assistant/route.ts`
- `lib/credits.ts`
- `components/CreditsPage.tsx`
- `components/AdminBillingPage.tsx`
- `app/api/billing/route.ts`
- `.env.example`
- `package.json`

## Validação

Os arquivos TypeScript/TSX alterados foram passados pelo parser/transpilador TypeScript sem erros de sintaxe.

A instalação completa de dependências no ambiente de geração ultrapassou o limite de execução, portanto o `next build` completo deve ser executado no deploy da Vercel ou localmente com `npm install && npm run build`.
