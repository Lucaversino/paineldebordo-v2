# V194 — Carta DHN automática no AIS

- Mantém a V193 e todas as funções atuais do AIS.
- A carta náutica entra automaticamente ao abrir o AIS; não há botão obrigatório para ativar.
- Seleção automática da carta pela posição central do mapa e pelo nível de zoom.
- Em zoom maior, prioriza cartas de cobertura menor/mais detalhadas.
- Usa tiles locais em `public/cartas/<numero>/...` quando instalados.
- Quando não há tiles locais, usa o serviço WMS oficial IDEM-DHN através de proxy interno `/api/dhn-map`, evitando problemas de CORS no navegador.
- O mapa OSM permanece embaixo como fallback caso o serviço DHN esteja temporariamente indisponível.
- Opacidade da carta: 92%, mantendo AIS, GPS, waypoints, rotas e XTE visíveis por cima.

## Segurança de versão

A V193 original não foi alterada. Esta é uma cópia separada V194.

## Observação

As Cartas Raster oficiais devem permanecer atualizadas conforme os Avisos aos Navegantes e não substituem os procedimentos/equipamentos oficiais exigidos para navegação segura.
