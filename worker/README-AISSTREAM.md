# AISStream worker — PAINEL DE BORDO

Serviço Node persistente para alimentar o AIS FREE sem abrir conexões AISStream por navegador ou por requisição da Vercel.

## Arquitetura

```
AISStream.io
     │
     ▼
worker/aisstream-worker.mjs  (Railway, processo contínuo)
     │
     ▼
Supabase PostgreSQL
  - public.ais_live_vessels
  - public.ais_live_worker_status
     │
     ▼
Vercel /api/ais-map
     │
     ▼
Mapa AIS FREE
```

O worker mantém uma única conexão WebSocket, assina as áreas configuradas logo após o `open`, reconecta com backoff + jitter, consolida a última posição por MMSI e persiste em lotes.

## Variáveis obrigatórias

- `AISSTREAM_API_KEY`: chave privada do AISStream.io. Nunca usar `NEXT_PUBLIC_`.
- `DATABASE_URL`: connection string PostgreSQL/Supabase usada pelo PAINEL DE BORDO.

## Variáveis opcionais

- `AISSTREAM_BOUNDING_BOXES_JSON`: JSON com bounding boxes no formato aceito pelo AISStream.
- `AISSTREAM_FLUSH_MS`: intervalo de persistência em lote; padrão `1500` ms.
- `AISSTREAM_PRUNE_HOURS`: remove posições antigas; padrão `48` h.
- `PORT`: injetada automaticamente pela Railway.
- `AIS_LIVE_MAX_AGE_MINUTES`: usada pela aplicação Vercel ao ler o cache; padrão `45` min.

## Railway

Use o repositório `Lucaversino/paineldebordo-v2` como fonte do serviço e configure individualmente esse worker.

- Branch: `main` depois da V159 ser aprovada/mesclada.
- Build command: `npm ci --omit=dev`
- Start command: `npm run ais:worker`
- Healthcheck path: `/health`
- Variáveis: `AISSTREAM_API_KEY` e `DATABASE_URL`

Não depender de `railway.json` para um serviço novo. A configuração Config as Code legada foi descontinuada pela Railway; configure o serviço no painel/plugin ou migre para o Infrastructure as Code atual.

## Health e diagnóstico

- `GET /health` no worker mostra conexão, assinatura, última mensagem e quantidade de MMSIs vistos.
- `GET /api/ais-stream` no PAINEL DE BORDO mostra o heartbeat persistido pelo worker sem expor a chave.
- `GET /api/ais-map?lat=...&lon=...&zoom=...` lê primeiro o cache AISStream e mantém VesselAPI/Kpler apenas como fallback.

As tabelas do cache usam RLS sem políticas públicas. O navegador não lê nem grava essas tabelas diretamente.
