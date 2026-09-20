# AISStream worker — PAINEL DE BORDO

Serviço Node persistente para o AIS FREE.

## Variáveis obrigatórias

- `AISSTREAM_API_KEY`: chave privada do AISStream.io.
- `DATABASE_URL`: conexão PostgreSQL/Supabase usada pelo PAINEL DE BORDO.

## Variáveis opcionais

- `AISSTREAM_BOUNDING_BOXES_JSON`: JSON com bounding boxes no formato aceito pelo AISStream.
- `AISSTREAM_FLUSH_MS`: intervalo de persistência em lote; padrão 1500 ms.
- `AISSTREAM_PRUNE_HOURS`: remove posições antigas; padrão 48 h.

O worker mantém uma única conexão WebSocket, envia a assinatura logo após o `open`,
faz reconexão com backoff, consolida por MMSI e grava a última posição em
`public.ais_live_vessels`.

A rota `/health` informa conexão, confirmação da assinatura e heartbeat.
