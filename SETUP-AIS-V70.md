# AIS v70 — mapa mobile + dois modos de busca

A v70 mantém a variável `DATADOCKED_API_KEY` já usada nas versões anteriores.

## Busca simples por barco
- Vessel by Name: 1 crédito.
- Vessel Location: 1 crédito para a posição escolhida.
- Primeira localização normalmente: 2 créditos.

## Busca por área
O endpoint Data Docked `get-vessels-by-area` aceita no máximo 50 km e custa 10 créditos por chamada.

- **50 km:** 1 consulta = 10 créditos.
- **100 km:** a v70 monta uma grade 3x3 de consultas de 50 km, remove duplicados e mantém somente barcos dentro de 100 km do centro. Custo aproximado: **90 créditos**.

A interface sempre pede confirmação antes da busca de 100 km e bloqueia quando o saldo conhecido é menor que 90 créditos.

## Uso no celular
Na página AIS o mapa ocupa praticamente toda a área útil. Os serviços ficam em uma barra flutuante dentro do mapa:
- Buscar
- Salvos
- Histórico
- Recentes

Cada pasta abre/fecha sobre o mapa. No modo Área, toque no mapa para definir o centro do círculo e escolha 50 km ou 100 km.
