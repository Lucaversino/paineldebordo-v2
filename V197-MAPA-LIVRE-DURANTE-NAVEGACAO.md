# V197 — Mapa livre durante a navegação

Correção focada no AIS, preservando as curvas batimétricas da V196.

## Corrigido
- Remove o overlay V161 que mantinha o SVG do MEU BARCO fixo no centro da tela.
- O barco volta a ser um marcador OpenLayers georreferenciado na posição GPS real.
- Ao arrastar o mapa com dedo ou mouse durante NAVEGAR, o acompanhamento automático é pausado.
- O cálculo da navegação, rumo, velocidade, distância, XTE, ETA, rastro e rota continua ativo em segundo plano.
- O botão Minha Localização/GPS recentraliza no barco e religa o acompanhamento automático.
- Cache PWA alterado para V197 para evitar o celular reutilizar a interface antiga.

## Comportamento esperado
1. Aperte NAVEGAR: o mapa acompanha o GPS.
2. Arraste o mapa: ele fica livre e o barco permanece na coordenada GPS, sem acompanhar o dedo.
3. Toque no botão GPS: volta para o barco e o acompanhamento é reativado.
