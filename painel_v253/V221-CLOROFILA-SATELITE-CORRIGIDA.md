# V221 — Clorofila por satélite corrigida

## Alterações

- Criado um provedor centralizado de clorofila NOAA CoastWatch / VIIRS no servidor.
- Fonte principal: VIIRS S-NPP + NOAA-20 NRT gap-filled.
- Fallback automático para NOAA-20 VIIRS NRT 4 km, S-NPP VIIRS NRT 4 km e science-quality gap-filled.
- Timeout por consulta aumentado de 2,8 s para 6,5 s.
- A área do mapa é consultada em lote: uma chamada por fonte em vez de 9 chamadas separadas.
- Uma falha em uma fonte não derruba a grade inteira; pontos faltantes recebem fallback da próxima fonte.
- O mapa continua usando os 9 pontos ao redor da posição para manter o layout atual.
- Ocean Intelligence passou a usar o mesmo mecanismo robusto.
- Captura histórica de clorofila ganhou fallback entre produtos VIIRS.
- O card da clorofila informa a fonte real usada e a data observada.
- O mapa mostra uma mensagem clara caso todas as fontes estejam temporariamente sem leitura.
- Cache do PWA atualizado para forçar a entrada da correção nos aparelhos instalados.

## Mantido intacto

AIS, navegação, waypoints, créditos, viagens, largadas, capturas, PDF, meteorologia, Copernicus semanal e onboarding V220.
