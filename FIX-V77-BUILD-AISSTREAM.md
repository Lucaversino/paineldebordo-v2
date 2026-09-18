# V77 — correção de build AIS legado

A versão atual usa a API HTTP da Data Docked em `app/api/ais/route.ts`.

Versões antigas do projeto usavam `app/api/ais-stream/route.ts` com WebSocket e dependências `@vercel/functions` e `ws`. Quando o projeto é atualizado pelo upload de arquivos no GitHub, um arquivo antigo já rastreado pode continuar no repositório mesmo que não esteja no ZIP novo.

Isso fazia o Turbopack parar com:

- `Module not found: Can't resolve '@vercel/functions'`
- `Module not found: Can't resolve 'ws'`

A V77 corrige isso de duas formas:

1. `.vercelignore` ignora `app/api/ais-stream/` nos novos deploys.
2. `prebuild-clean.mjs` remove `app/api/ais-stream` antes de `next build`, inclusive se o arquivo antigo continuar rastreado no GitHub.

Não é necessário instalar `ws` nem `@vercel/functions`, porque esse endpoint WebSocket não é mais usado.
