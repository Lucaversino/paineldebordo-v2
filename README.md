## V93 — camada AIS automática no mapa

O mapa AIS agora carrega embarcações reais automaticamente sem consumir créditos do usuário. A fonte principal é **AISStream** e o fallback é **VesselAPI Free**. A pesquisa manual existente continua separada e mantém a cobrança configurada. As chaves permanecem somente no backend e a nova rota usa cache por região para reduzir chamadas externas.

Configure `AISSTREAM_API_KEY` e `VESSELAPI_API_KEY` na Vercel. Consulte `FIX-V93-AIS-CAMADA-GRATUITA.md`.

## V92 — gráfico legível no modo escuro

O tooltip do gráfico de desempenho foi corrigido para fundo escuro e texto branco, inclusive com fallback para o tooltip padrão do Recharts.

# PAINEL DE BORDO — v87

Continuação direta da V86. O antigo Painel/Pilot IA foi substituído pela **FISH IA**, com interface flutuante limpa, conversa sem mensagens prontas, tipografia grande e personalidade de pescador experiente com foco em **corvina (Micropogonias furnieri)**, Lua, vento, maré, temperatura da água e clorofila.

O painel administrativo agora possui controle **LIGAR/DESLIGAR FISH IA** individualmente para cada usuário. Consulte `FIX-V87-FISH-IA.md`.

---

# PAINEL DE BORDO — v85

Continuação direta da **V84**. A V85 restaura a lógica de análise do **Painel IA da V52** dentro do botão flutuante e deixa a IA **livre/grátis para todos os usuários**, sem desconto de créditos. Os créditos continuam existindo somente para os recursos AIS.

Principais mudanças da V85:

- Painel IA V52 em janela flutuante;
- perguntas, análise de viagem, comparação, melhores condições e próxima largada marcadas como **GRÁTIS**;
- nenhuma rota da IA chama cobrança/debito de créditos;
- carteira marca `free_ai_access = true` como proteção adicional;
- preços internos da IA migrados para zero e bônus antigo de IA desativado;
- botão **Testar API** dentro do assistente;
- `GET /api/ai-assistant` testa de verdade a chave e o modelo na OpenAI, em vez de apenas conferir se a variável existe;
- timeout do navegador ampliado e tratamento de falha do banco separado da chamada OpenAI;
- se o contexto do Supabase falhar, o assistente tenta responder com os dados disponíveis em vez de cancelar toda a consulta.

A checagem do projeto em produção mostrou que o endpoint de status da IA respondia, mas uma consulta POST retornou 502 e os logs da Vercel também registravam timeouts/fechamentos de conexão do pooler do Supabase. Por isso a V85 separa melhor **problema de banco** de **problema de OpenAI** e exibe o resultado do teste real da API.

Consulte `FIX-V85-IA-V52-GRATIS-API.md`.

---

# PAINEL DE BORDO — v84

Continuação direta da V83. O Super Admin deixa de ter AIS/IA grátis e recebe **80 créditos iniciais, uma única vez**. O painel administrativo interno agora permite localizar usuários e adicionar créditos manualmente (+10, +20, +50, +100 ou valor personalizado), com registro no extrato e estatística separada de créditos vendidos.

AIS e Painel IA passam a consumir o saldo real do administrador. As demais funcionalidades da V83 são preservadas. Consulte `FIX-V84-ADMIN-80-CREDITOS.md`.

## v80 — desempenho e bônus IA

Versão focada em desempenho. Dashboard e navegação carregam módulos pesados somente quando necessários, consultas principais do Dashboard foram paralelizadas e o registro ambiental de novas largadas passou para segundo plano após o salvamento operacional.

Cada **novo usuário** recebe **R$ 2,00 de bônus exclusivo para o Painel IA**. O bônus não serve para AIS, é consumido antes dos créditos comprados e pode ser alterado pelo Super Admin.

Consulte `FIX-V80-PERFORMANCE-BONUS-IA.md`.

## v71 — AIS mobile

- Aviso “Nenhum barco selecionado” agora possui botão × para fechar e liberar totalmente a visão do mapa.

# PAINEL DE BORDO — v70

Versão v70: AIS mobile em mapa inteiro, painéis flutuantes recolhíveis, busca individual por barco e busca por área de 50/100 km.

Consulte `SETUP-AIS-V70.md` para custos e funcionamento da busca por área.


## v69 — previsão automática por largada

- Registra automaticamente vento, rajadas, ondas, swell, maré/nível modelado, temperatura do mar, corrente, clorofila e fase lunar quando uma largada é salva.
- Faz backfill gradual das largadas antigas (inclusive viagens finalizadas) usando dados históricos quando disponíveis.
- Preserva um snapshot do dia por largada para o PAINEL IA correlacionar ambiente x captura.
- O PDF normal continua sem previsão. Um botão separado **PDF + previsão** gera um anexo ambiental por largada.
- Em Configurações há o botão **Sincronizar todas as largadas** para forçar/completar o backfill.

# PAINEL DE BORDO — PESCA INDUSTRIAL v63

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
- Inteligência Oceânica: Lua, nascer/pôr da Lua e do Sol, vento, ondas, swell, corrente de maré em nós/MN por hora com direção do fluxo, temperatura do mar e clorofila
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


## v63 — card AIS abaixo do mapa

- Card da embarcação removido de cima do mapa.
- Posição AIS, fonte, horário e dados do barco agora aparecem em um card compacto abaixo da carta.
- No desktop o card tem largura reduzida e detalhes em linha; no celular reorganiza automaticamente.
- O mapa permanece totalmente livre para visualização e navegação.

## v66 — Histórico AIS e Barcos Salvos

A página AIS agora mantém uma biblioteca privada por usuário no Supabase:

- **Pasta de barcos salvos** para guardar embarcações frequentes sem gastar créditos para reabrir a última posição conhecida.
- **Histórico AIS** das últimas posições realmente consultadas no Data Docked.
- **Limpar histórico** apaga somente o histórico AIS da conta logada.
- Barcos salvos podem ser removidos individualmente e atualizados por **1 crédito**.
- Quando um barco salvo recebe uma nova posição, a última posição armazenada é atualizada automaticamente.
- O banco cria as tabelas AIS automaticamente na primeira utilização e mantém RLS habilitado.


## v66 — Carta da Marinha online

- Remove o modo Oceano do AIS: ficam apenas **Marinha** e **Mapa**.
- O modo Marinha consulta o **WMS oficial do GeoServer IDEM-DHN** e não depende de tiles locais convertidos.
- Se existirem tiles locais em `public/cartas`, eles continuam tendo prioridade.
- O catálogo oficial é descoberto em `/api/dhn/charts` e a carta pode ser escolhida automaticamente pela posição/zoom quando o WMS fornece limites geográficos.
- Os scripts KAP/BSB continuam no projeto para uso offline, mas não são necessários para o mapa online.

## V68 — Ventos e Mar: histórico e salvos

- A última consulta permanece aberta após recarregar a página.
- Cada nova consulta é adicionada automaticamente ao histórico (até 20 registros por usuário).
- Previsões podem ser salvas com nome personalizado.
- Abrir histórico ou salvos reutiliza o snapshot sem chamar novamente as APIs meteorológicas.
- Botão **Limpar campos** prepara latitude/longitude para uma nova busca sem apagar o resultado atual.
- Botão **Limpar histórico** não remove as previsões salvas.
- As tabelas `forecast_history` e `saved_forecasts` são criadas automaticamente pela rota privada `/api/forecast-library`.

## v72 — Painel IA flutuante
O assistente OpenAI agora é global e abre por um botão flutuante no canto inferior direito, tanto no desktop quanto no celular. O chat usa a mesma rota `/api/ai-assistant`, lê os dados reais do painel e mantém a conversa durante a sessão do navegador.


## v73 — Painel IA com tipografia ampliada

- Chat flutuante mantido no desktop e mobile.
- Mensagens em 17 px no desktop e 16 px no celular.
- Cabeçalho, atalhos rápidos, contexto, avisos e campo de digitação ampliados.
- Painel desktop mais largo e área de conversa mais confortável.
- No celular, o chat usa até 82% da altura útil e mantém o compositor sempre visível.
- Conversas da v72 são reaproveitadas automaticamente na primeira abertura.

## v75 — correção do card AIS e salvar barco
- Corrige o layout 1:1 dos cards AIS no desktop.
- Página AIS volta a rolar no desktop para não cortar os cards abaixo do mapa.
- Salvamento de barcos usa upsert atômico e feedback SALVANDO/SALVO.
- Mantém até 3 cards recentes.

## v76 — monetização AIS + Painel IA com carteira única

- Carteira única de créditos por usuário.
- 1 crédito = R$ 1,00 por padrão, configurável no backend/Admin.
- AIS simples: localizar barco e atualizar posição usam valores oficiais do backend.
- Painel IA com modos simples, completo e avançado e cobrança somente após resposta válida.
- Super Admin autenticado por e-mail com acesso ao painel administrativo e saldo inicial único de 80 créditos; AIS/IA consomem créditos normalmente.
- Extrato de créditos.
- Compra de pacotes via Mercado Pago Checkout Pro com webhook e crédito somente após confirmação real do pagamento.
- Painel Admin com receita, consumo, tokens, custo estimado e margem.
- Configuração de modelos OpenAI e custos estimados por token.

Consulte `SETUP-V76-CREDITOS-MERCADOPAGO.md` antes de publicar.

## V86 — correção do Admin e chat da IA simplificado

A V86 corrige o carregamento infinito da área **Admin — AIS, IA e Créditos** com timeouts, retry e carregamento separado de resumo/usuários. Também remove os quatro atalhos de perguntas do Painel IA, deixando a conversa centralizada na caixa de mensagem.

Veja `FIX-V86-ADMIN-LOADING-IA-CHAT-LIMPO.md`.

## V88 — FISH AI com histórico

- Cabeçalho **FISH AI**.
- Botão para limpar e iniciar uma nova conversa.
- Pasta de histórico com data/hora, restauração e exclusão individual de conversas.
- Histórico local separado por usuário autenticado.

Veja `FIX-V88-FISH-AI-HISTORICO.md`.


## V89 — Corrente de maré no dashboard

- O card **MARÉ MODELADA** do dashboard foi substituído por **CORRENTE DE MARÉ**.
- Mostra velocidade em **nós** e também em **milhas náuticas por hora (MN/h)**.
- Mostra para onde a corrente está indo: **Norte, Sul, Leste ou Oeste**, com rumo em graus e ponto cardeal.
- Mostra também a componente Norte/Sul para facilitar a leitura operacional.
- A leitura vem do modelo oceânico usado pela API; não substitui informação oficial de navegação costeira.

## V90 — posição da Inteligência Oceânica
A análise ambiental usa por padrão a primeira posição registrada na primeira largada do dia. O usuário pode alterar temporariamente o ponto pelo botão **Alterar posição** sem modificar os dados da largada no banco. A posição é exibida em graus e minutos decimais (S/W).


## V91 — gráfico de desempenho legível

- Remove o tooltip branco do gráfico.
- Tooltip próprio em tema escuro com Capturado, Meta esperada, Diferença e Ritmo da meta.
- Resumo numérico permanente acima do gráfico.
- Linha da produção acumulada e linha da meta agora têm identificação visual distinta.
- Eixos e datas ficam mais legíveis e usam formatação pt-BR.
- Layout responsivo para celular.


## V94 — Kpler AIS
A camada automática usa AISStream → VesselAPI Free → Kpler Maritime 2.0. Configure `KPLER_API_KEY` apenas no backend/Vercel.
