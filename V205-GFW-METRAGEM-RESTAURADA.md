# V205 — GFW por nome + metragem restaurada

## Busca Global Fishing Watch
- A busca por nome continua usando a API oficial Global Fishing Watch V3.
- Agora pede `MATCH_CRITERIA`, recebe até 50 registros e ordena por relevância real do nome/MMSI/IMO/indicativo.
- Evita destacar resultados em que o termo apareceu apenas em outro campo do cadastro.
- Ao escolher um barco encontrado no GFW, o MMSI/identidade é enviado automaticamente para as fontes de posição FREE.
- O fluxo tenta APRS.fi primeiro e ShipFinder como fallback automático quando ambos estiverem configurados.
- Se o barco existe no GFW mas nenhuma fonte FREE tiver posição atual, o painel informa isso sem confundir identidade com posição.

## Linhas de metragem / batimetria
- Restaurada e reforçada a camada de curvas batimétricas da V196.
- Linhas e rótulos de profundidade entre 10 e 200 m ficam acima da carta e das áreas transparentes e abaixo dos barcos.
- Rótulos em metros foram reforçados para desktop e celular.
- Fonte vetorial passa a aceitar tiles até zoom 14 e faz overzoom até o zoom do mapa.
- O backend tenta múltiplos endpoints públicos do mesmo dataset AWS Terrain Tiles antes de desistir.

## Preservado
- Busca FREE principal.
- Premium.
- Resultados 50 km e regra de 8 horas.
- Barcos salvos.
- Waypoints, rotas, áreas administrativas e GPS.
