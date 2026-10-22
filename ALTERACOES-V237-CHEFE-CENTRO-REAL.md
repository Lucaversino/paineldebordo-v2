# V237 — Chefe central verdadeiro

Corrigido o cálculo de distribuição dos barcos: o índice central agora é a quantidade de embarcações da turma de terra, e não a metade do total. O chefe ocupa sempre a referência (slot 0), independentemente de quantidades desiguais de barcos nos lados. A faixa vermelha usa o mesmo slot 0 que determina as coordenadas, evitando divergência entre a indicação visual e as posições geradas. Mantidas turmas, PDF, GPX e cálculo magnético.

## Testes realizados
- Terra 4 / fora 0
- Terra 0 / fora 5
- Terra 8 / fora 10
- Terra 0 / fora 0

Em todos os casos o chefe ocupa a referência com as coordenadas originais. Ainda não foi executado o build completo de Next.js.
