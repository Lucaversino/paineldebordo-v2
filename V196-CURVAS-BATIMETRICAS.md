# V196 — Curvas batimétricas com metragem no AIS

## Objetivo
Exibir a profundidade de forma visual no próprio AIS, automaticamente, sem o usuário precisar ativar uma camada.

## Implementação
- Nova camada vetorial de isóbatas sobre o mapa/carta.
- Rótulos em metros diretamente nas curvas.
- Níveis principais: 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 120, 150, 175 e 200 m (densidade varia com o zoom).
- Processamento em tiles e cache no servidor para evitar travamentos no celular.
- Curvas ficam acima do mapa/carta DHN e abaixo dos barcos, GPS, waypoints e rotas.
- Carregamento automático ao abrir o AIS; não existe botão obrigatório para ativar.
- Cobertura operacional limitada à faixa sul/sudeste do Brasil usada pelo projeto.

## Fontes
- Curvas dinâmicas: AWS Open Data / Mapzen Terrain Tiles. No oceano, a fonte documentada do dataset é ETOPO1.
- Carta náutica DHN permanece independente e continua sendo a referência náutica disponível no projeto.
- O relevo GEBCO da V195 foi mantido como fundo auxiliar em menor opacidade.

## Segurança
As curvas geradas são uma camada de apoio à pesca e leitura do relevo submarino. Não substituem carta náutica oficial, ecossonda ou sondagem local para segurança da navegação.
