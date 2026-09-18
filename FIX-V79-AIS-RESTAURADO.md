# V79 — AIS restaurado + créditos

Esta versão restaura a interface AIS completa que existia antes da simplificação da V76/V78.

## Restaurado
- pesquisa por nome com lista de resultados para escolher o barco correto;
- consulta de posição individual por IMO/MMSI;
- mapa grande com posição do barco;
- busca por área de 50 km;
- seleção do centro pelo mapa;
- GPS do celular/desktop;
- latitude/longitude manual;
- círculo de 50 km no mapa;
- barcos encontrados na área;
- pasta Barcos salvos;
- Histórico AIS e botão limpar histórico;
- até 3 cards recentes 1:1 abaixo do mapa;
- painel móvel com Buscar / Salvos / Histórico / Recentes;
- botão para fechar o aviso “Nenhum barco selecionado”.

## Créditos
- a busca pelo nome lista candidatos sem descontar a carteira interna;
- a consulta individual só desconta depois que uma posição válida é retornada;
- custo padrão da consulta completa: 2 créditos;
- atualização de posição: configurável no Admin (fallback 1 crédito);
- busca por área de 50 km: configurável no Admin (fallback 10 créditos);
- Super Admin continua grátis.

## API
A integração permanece no backend usando `DATADOCKED_API_KEY` e os endpoints Data Docked de busca por nome, posição individual e área.
