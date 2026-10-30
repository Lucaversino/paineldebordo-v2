# V213 — AIS LIGHT · SEARCH ONLY

Objetivo: deixar o AIS leve durante navegação e impedir carregamento automático de embarcações.

## Alterações
- Removido polling automático de embarcações AIS a cada 60 segundos.
- Removida busca automática de barcos ao mover/arrastar/zoom do mapa.
- Removido carregamento automático de barcos globais do administrador no mapa do usuário.
- Barcos salvos continuam disponíveis na biblioteca, mas não são desenhados automaticamente.
- Ao iniciar NAVEGAR ou navegação para waypoint, todos os marcadores AIS são limpos do mapa.
- BUSCAR FREE e BUSCA PREMIUM continuam normais: somente a pesquisa solicitada carrega a embarcação.
- Nova pesquisa individual limpa resultados antigos e mantém apenas o barco pesquisado.
- Busca manual por área continua disponível e mostra apenas o resultado daquela consulta.
- Histórico e Barcos salvos continuam abrindo a embarcação sob demanda.
- Registro de histórico foi otimizado: não faz mais um GET completo da biblioteca depois de cada consulta.
- A atualização de um barco já salvo é feita pelo mesmo POST do histórico, evitando chamada duplicada.

## Mantido
- Batimetria/metragem e curvas de profundidade.
- Carta DHN.
- GPS e ícone do próprio barco.
- Waypoints, rotas, régua, XTE e rastro de navegação.
- Busca FREE e PREMIUM, histórico e salvar barco.
- Ferramentas administrativas e rotina de servidor permanecem disponíveis fora do carregamento do mapa do usuário.

## Limpeza de projeto
- Removidos arquivos markdown históricos de versões FIX/V antigas do pacote final.
- Removido `tsconfig.tsbuildinfo` (cache gerado do TypeScript; será recriado quando necessário).
