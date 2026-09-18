# V78 — correção do carregamento infinito da carteira

## Causa encontrada nos logs da Vercel
As rotas de carteira, AIS, IA e snapshots ambientais executavam CREATE TABLE/INDEX em cold starts concorrentes. O Supabase Transaction Pooler fechava algumas conexões (`CONNECTION_CLOSED`), causando timeouts 504 e telas presas em “Carregando...”.

## Correções
- schema de créditos e snapshots é apenas consultado nas requisições normais; DDL ocorre somente se a tabela realmente não existir;
- histórico AIS segue a mesma regra;
- backfill ambiental não disputa conexão no carregamento inicial;
- assistente IA só consulta seu status quando o usuário abre o chat;
- `Meus créditos` usa timeout de 10 s, mostra erro real e botão `Tentar novamente`;
- `/api/session` continua autenticando mesmo se a carteira estiver temporariamente indisponível.

Nenhuma variável nova é necessária.
