# V94 — Kpler AIS / Maritime 2.0

## Alteração

A camada automática do mapa AIS agora suporta três fontes no backend:

1. AISStream — principal
2. VesselAPI Free — fallback
3. Kpler Maritime 2.0 GraphQL — terceiro fallback

A pesquisa manual continua separada e mantém a cobrança de créditos existente. A camada automática continua retornando `creditsUsed: 0`.

## Kpler

- Endpoint padrão: `https://api.sml.kpler.com/graphql`
- Autenticação: `Authorization: Bearer <token>`
- Variável de ambiente: `KPLER_API_KEY`
- A chave nunca é enviada para o navegador.
- A consulta usa `areaOfInterest` com o mesmo retângulo do mapa e pede somente nome, MMSI, IMO, latitude, longitude, rumo, velocidade, proa, status e horários.
- Cache de 5 minutos e stale cache de 15 minutos para Kpler, reduzindo chamadas.
- Kpler só é chamada se AISStream e VesselAPI estiverem indisponíveis.

## Observação

O token precisa ter permissão para Maritime 2.0 / Vessels. Uma chave existente no portal Kpler pode autenticar, mas a conta ainda precisa ter o produto/API autorizado.
