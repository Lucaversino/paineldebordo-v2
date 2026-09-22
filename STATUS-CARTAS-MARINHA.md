# Status das Cartas da Marinha — V194

- Carta DHN habilitada automaticamente ao abrir o AIS.
- Sem necessidade de botão para ativar a carta.
- Seleção automática por posição + zoom.
- Prioridade para carta local convertida quando instalada.
- Fallback online pelo WMS IDEM-DHN via proxy interno `/api/dhn-map`.
- OSM mantido embaixo para não deixar o AIS sem mapa em caso de indisponibilidade externa.
- AIS, GPS, waypoints, rotas, XTE e navegação continuam em camadas superiores e não foram removidos.
