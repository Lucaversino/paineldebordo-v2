# V206 — Busca FREE do Admin via Global Fishing Watch

## Problema corrigido
Na V205, a pesquisa do bloco **Barcos FREE para todos** não consultava o Global Fishing Watch. Quando APRS.fi estava configurado, a pesquisa por nome parava no APRS.fi e podia retornar vazio sem tentar uma fonte de identidade adequada.

## Novo fluxo
1. Nome / indicativo -> Global Fishing Watch (identidade do barco).
2. Se GFW não retornar -> ShipFinder como fallback de pesquisa textual.
3. APRS.fi apenas como último fallback da pesquisa textual.
4. Ao adicionar o barco -> consulta de posição FREE tenta APRS.fi e ShipFinder com fallback.
5. Pesquisa por MMSI/IMO continua aceita diretamente.

## Interface
Os resultados do Admin agora mostram a fonte usada, por exemplo **Fonte: Global Fishing Watch**.

## Importante
Para usar o GFW no servidor é necessário `GFW_API_TOKEN` configurado. Para obter posição atual também é necessário pelo menos APRS.fi ou ShipFinder configurado.
