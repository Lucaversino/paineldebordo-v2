# V81 — AIS API / autenticação corrigidos

- Data Docked usa `x-api-key` no backend, nunca no navegador.
- Endpoints oficiais usados:
  - `/api/vessels_operations/vessels-by-vessel-name`
  - `/api/vessels_operations/get-vessel-location`
  - `/api/vessels_operations/get-vessels-by-area`
- O navegador envia também o token Supabase Bearer para `/api/ais`, além dos cookies.
- Se a sessão estiver em processo de renovação no PWA/mobile, o cliente executa `refreshSession()` e repete a chamada uma vez.
- O backend aceita autenticação por cookie ou Bearer token.
- Chamadas Data Docked têm timeout curto, uma repetição para falhas transitórias e mensagens específicas para 401/403/404.
- Respostas `detail` e respostas diretas são aceitas para tolerar variações do provedor.

Variável obrigatória na Vercel:
`DATADOCKED_API_KEY`
