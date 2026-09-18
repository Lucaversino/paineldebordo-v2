# V89 — Corrente de maré

Continuação direta da V88.

## Alteração do dashboard

O card **MARÉ MODELADA** foi removido do bloco principal de Inteligência Oceânica e substituído por **CORRENTE DE MARÉ**.

Agora o card exibe:

- velocidade da corrente em **nós**;
- equivalente em **milha náutica por hora (MN/h)**;
- direção em graus;
- ponto cardeal;
- indicação operacional **VAI PARA NORTE**, **VAI PARA SUL** ou, quando a componente longitudinal é dominante, **VAI MAIS PARA LESTE/OESTE**;
- leitura simples do sentido predominante da corrente e rumo em graus.

A velocidade em nós é calculada a partir de km/h usando 1 nó = 1,852 km/h. A direção segue o sentido para onde a corrente está indo.

O card MAR / ONDA deixou de repetir a velocidade da corrente e passa a mostrar a hora de atualização do modelo oceânico.
