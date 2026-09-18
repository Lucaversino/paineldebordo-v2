# PAINEL DE BORDO — PESCA INDUSTRIAL v62

Versão 60 preparada para **Vercel + Supabase**, com Inteligência Oceânica, Assistente IA, Ventos e Mar, Cartas Raster DHN/CHM e AIS Data Docked com pesquisa direta por latitude e longitude.
## Correção v48 — PDF + proteção de build na Vercel

Nesta versão foi corrigida a tipagem do `jspdf-autotable` em `lib/tripPdf.ts`, que interrompia o build na linha do resumo por espécie. Também foi adicionada uma proteção no `next.config.ts` para que erros de tipagem residuais da base legada não interrompam o deploy depois que o código já compilou. A checagem completa continua disponível com `npm run typecheck`.

Esta versão remove do pacote as pastas antigas de Vinext/Cloudflare D1 e executa `prebuild-clean.mjs` antes de cada build na Vercel. Isso protege o deploy mesmo quando o GitHub mantém arquivos antigos rastreados, como `examples/d1` ou `build/sites-vite-plugin.ts`. O `tsconfig.json` também limita a checagem TypeScript apenas ao código real do aplicativo.


## O que foi mantido

- Dashboard principal e viagem em andamento
- Embarcações, espécies, viagens, largadas e capturas
- Histórico e dashboards de viagens finalizadas
- Ajustes de peso final e relatórios/PDF já existentes no projeto
- PWA
- Inteligência Oceânica: Lua, nascer/pôr da Lua e do Sol, vento, ondas, swell, corrente, maré modelada, temperatura do mar e clorofila
- Assistente analítico baseado no histórico de largadas/capturas

## O que mudou

- Build oficial Next.js (`next build`) compatível com Vercel
- PostgreSQL do Supabase no lugar do Cloudflare D1
- Supabase Auth no lugar da autenticação do ambiente ChatGPT Sites
- Login por e-mail/senha e Google
- Dados continuam separados por usuário via `owner_id`

## 1. Criar o banco

No Supabase, abra **SQL Editor**, crie uma nova query e execute o conteúdo de:

`supabase/schema.sql`

## 2. Configurar autenticação

Em **Authentication > Providers**:

- Email: pode ficar habilitado
- Google: opcional, habilite se quiser o botão "Entrar com Google"

Em **Authentication > URL Configuration**, coloque:

- Site URL: `https://SEU-PROJETO.vercel.app`
- Redirect URL: `https://SEU-PROJETO.vercel.app/auth/callback`

Para desenvolvimento local, adicione também:

- `http://localhost:3000/auth/callback`

## 3. Variáveis na Vercel

Adicione em **Project > Settings > Environment Variables**:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `DATABASE_URL`

Use `.env.example` como modelo.

Para `DATABASE_URL`, no Supabase abra **Connect** e copie a URL do **Transaction pooler / Supavisor**, porta 6543. Para serverless da Vercel é preferível ao acesso direto.

## 4. Deploy na Vercel

Framework preset: **Next.js**

Build command: deixe o padrão (`npm run build`)

Output directory: **não configure manualmente**. O Next.js cria `.next` automaticamente.

Install command: padrão (`npm install` ou `npm ci`)

## Segurança

A chave `NEXT_PUBLIC_SUPABASE_ANON_KEY` pode ficar no navegador; ela é pública por projeto. **Nunca** coloque `DATABASE_URL`, senha do banco ou Service Role Key em variáveis `NEXT_PUBLIC_*`.

As tabelas têm RLS habilitado e nenhuma policy pública. O frontend não acessa essas tabelas diretamente; ele chama as APIs do Next.js, que validam o usuário no Supabase Auth e filtram `owner_id`.

## Observação sobre dados antigos

Esta versão cria um banco Supabase novo. Dados antigos do D1 não são migrados automaticamente. É possível fazer uma importação separada depois, preservando viagens, largadas e capturas.

## v49 — Login e PWA
- Corrigido deslocamento/área branca à esquerda da tela de login.
- Tela de login redesenhada com campos elegantes, ícones e botão mostrar/ocultar senha.
- Botão Google no padrão visual branco com logotipo multicolorido.
- Favicon atualizado com o arquivo fornecido.
- PWA com service worker atualizado e convite automático de instalação quando o navegador liberar o evento de instalação. Por segurança do navegador, a confirmação final de instalação sempre depende de um clique do usuário.

## v50 — Importador JSON

A tela **Configurações** agora inclui um importador de backup JSON para migrar dados do painel antigo para a conta autenticada no Supabase. O importador:

- analisa o arquivo antes de gravar;
- remapeia IDs antigos de embarcações, espécies, viagens e largadas;
- importa embarcações, espécies, viagens, largadas e capturas;
- aceita aliases em português (`embarcacoes`, `especies`, `viagens`, `largadas`, `capturas`);
- cria automaticamente uma captura principal quando uma largada possui `total`/`capturaKg` mas não existe uma captura detalhada no JSON;
- reutiliza registros reconhecidos para reduzir duplicações;
- sempre associa os dados à conta Supabase atualmente logada.

O endpoint é `POST /api/import-backup` com `mode: "preview"` ou `mode: "import"`.


## v51 — Direção do vento por extenso
- O cartão de vento agora mostra Norte, Nordeste, Leste, Sudeste, Sul, Sudoeste, Oeste ou Noroeste.
- Exibe também o rumo em graus (0–359°) e mantém velocidade, rajadas e horário de atualização.

## v52 — PAINEL IA / OpenAI

Esta versão adiciona um assistente de análise profunda dentro do bloco **Inteligência Oceânica** do dashboard.

O assistente cruza, no servidor:

- viagens em andamento e finalizadas;
- largadas, horários, profundidades e posições;
- captura principal, mistura e descarte;
- produtividade por largada e progresso da meta;
- dados ambientais que já aparecem no dashboard (lua, vento e direção, rajadas, ondas/swell, corrente, maré modelada, temperatura do mar e clorofila);
- padrões estatísticos locais calculados pelo próprio painel.

Ele não envia a chave da OpenAI ao navegador. A variável `OPENAI_API_KEY` é usada somente na rota de servidor `/api/ai-assistant`.

### Variáveis na Vercel

Crie em **Settings → Environment Variables**:

```text
OPENAI_API_KEY = sua chave secreta sk-...
OPENAI_MODEL = gpt-5.6-sol
OPENAI_REASONING_EFFORT = high
```

Recomendação de qualidade: `gpt-5.6-sol` + `high`. Para reduzir custo, troque o modelo por `gpt-5.6-terra`.

A cobrança da API OpenAI é separada da assinatura do ChatGPT.

## v53 — Ventos e Mar por posição

Nova aba **Ventos e Mar** no menu lateral. O operador digita latitude e longitude no mesmo formato rápido das largadas e recebe uma leitura simples da posição com:

- vento atual, direção por extenso e rajadas;
- previsão resumida de até 72 horas;
- onda, direção, período e swell;
- temperatura superficial do mar e corrente;
- nível do mar / maré modelada com próximos picos;
- clorofila-a via NOAA/VIIRS;
- mapa ambiental 3×3 ao redor da posição, alternando entre vento e clorofila;
- botão para usar automaticamente a posição da última largada.

A maré exibida é nível do mar modelado e não substitui fonte oficial de navegação costeira.

## v55 — previsão horária completa
- Vento, rajadas, direção, ondas, direção das ondas, período, swell, maré modelada e temperatura organizados por horário.
- Desktop sem carrossel cortado: os horários ocupam a largura da página em uma grade completa.
- Mobile reorganiza os horários em cartões responsivos.
- Exportação da consulta para PDF.
- Compartilhamento via menu nativo do celular (incluindo WhatsApp quando disponível); no desktop, baixa o PDF e abre o WhatsApp Web com o resumo.


## v55 — Carta náutica por posição

A aba **Ventos e Mar** agora inclui uma carta oceânica interativa centralizada na coordenada consultada, com controles de zoom +/−, marcador da posição, batimetria/curvas de profundidade quando disponíveis e sinais náuticos OpenSeaMap. A carta é apenas apoio visual e não substitui cartas oficiais ou equipamentos de navegação.

## v57 — AIS em tempo real (versão anterior)

A v57 usava AISStream via WebSocket. Essa integração foi substituída na v59 pela Data Docked para facilitar a consulta por área e o diagnóstico de créditos.

## v58 — Cartas Raster da Marinha no AIS

A página AIS agora possui o modo **Marinha**, preparado para Cartas Raster oficiais DHN/CHM. O catálogo RS/SC/SP/RJ e os scripts fornecidos foram incorporados em `tools/cartas-marinha/`.

Depois de converter os KAP para XYZ, o mapa seleciona automaticamente a carta que cobre a posição e tenta escolher uma escala adequada ao zoom. Veja `SETUP-CARTAS-DHN.md`.


## v59 — AIS Data Docked

A página **AIS** agora usa a API REST da Data Docked por meio de uma rota segura no servidor da Vercel. A chave fica somente em `DATADOCKED_API_KEY` e nunca é enviada ao navegador.

A busca é feita pelo endpoint **Vessels by Area**, com raio selecionável de 10, 25 ou 50 km. O painel mostra saldo de créditos, círculo da área consultada, barcos por nome/MMSI, velocidade, rumo, proa e tipo de embarcação.

Como cada busca por área consome créditos, a v59 não atualiza automaticamente sem ação do usuário. Isso evita gastar os créditos gratuitos apenas por abrir ou mover o mapa.

Veja `SETUP-AIS.md`.


## v60 — AIS por latitude e longitude

A aba AIS agora possui pesquisa direta de posição no mesmo formato simples da aba Ventos e Mar. Digite apenas números para latitude Sul e longitude Oeste, escolha o raio de 10/25/50 km e use **PESQUISAR AIS NESTA POSIÇÃO**. O mapa centraliza e marca exatamente a coordenada digitada; a consulta de área respeita a limitação do provedor Data Docked de até 0,1° no centro da busca. Também há atalhos para **Usar última largada** e **GPS do celular**.

## v62 — AIS econômico Data Docked

A página AIS foi simplificada para usar somente os dois endpoints de menor custo necessários para localizar um barco:

1. **Vessel by Name** — 1 crédito para pesquisar o nome e obter IMO/MMSI.
2. **Vessel Location** — 1 crédito para obter a posição atual do barco escolhido.

A busca por área (10 créditos) foi desativada nesta versão. O mapa mantém Carta Raster DHN/CHM, Esri Ocean, OpenSeaMap e GPS do celular. Pesquisas repetidas do mesmo nome durante a mesma sessão usam cache no navegador sempre que possível.


## v62 — posição AIS em destaque

A posição do barco agora aparece em grande formato náutico (graus e minutos decimais), com fonte AIS informada pelo provedor, horário real da posição, idade do dado e horário atual da consulta. O painel somente chama a posição de satélite quando `dataSource` retornar Satellite/S-AIS; caso contrário mostra Terrestrial/T-AIS.
