# AIS Data Docked — v62

Configure na Vercel:

```text
DATADOCKED_API_KEY=sua_chave
```

Use como **Secret** e faça Redeploy.

## Fluxo de créditos

- Consulta de saldo: grátis.
- Busca pelo nome (`vessels-by-vessel-name`): 1 crédito.
- Posição do barco (`get-vessel-location`): 1 crédito.
- Primeira localização completa: normalmente 2 créditos.
- Atualizar novamente a posição do mesmo barco: 1 crédito por atualização.

A busca por área foi desativada na v62 para evitar o endpoint de 10 créditos.

A chave nunca é enviada ao navegador. Todas as chamadas passam por `/api/ais` no servidor Next.js/Vercel usando o header `x-api-key`.
