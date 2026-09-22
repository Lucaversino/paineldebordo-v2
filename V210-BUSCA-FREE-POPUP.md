# V210 — Busca FREE em popup

Objetivo: deixar a Busca FREE com o mesmo comportamento visual da Busca Premium, sem mexer nas funções do mapa/AIS.

## Alterações
- A antiga barra FREE fixa no topo do mapa foi removida.
- Criado botão **BUSCAR FREE** acima dos controles centrais já existentes.
- Ao tocar/clicar em **BUSCAR FREE**, abre uma janela popup com:
  - Global Fishing Watch FREE;
  - outras fontes FREE já existentes;
  - campo de pesquisa e resultados.
- Ao tocar/clicar novamente no botão, a janela fecha.
- Ao tocar/clicar em qualquer ponto do mapa, as janelas de Busca FREE/Premium fecham automaticamente.
- Ao selecionar uma embarcação FREE, a janela FREE fecha e a posição continua sendo aberta pelo fluxo já existente.
- Abrir FREE fecha Premium e abrir Premium fecha FREE, evitando sobreposição.
- O popup Premium foi reposicionado apenas visualmente para abrir acima da pilha de botões.

## Proteções
Não foram alterados:
- Global Fishing Watch e APIs FREE;
- Data Locked/Premium e créditos;
- GPS e marcador do próprio barco;
- batimetria, linhas de profundidade/metragem e mapa;
- waypoints, rotas, régua e XTE;
- navegação e atualização automática das camadas AIS.
