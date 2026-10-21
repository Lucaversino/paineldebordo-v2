# V236 — Destaque no chefe selecionado

## Correção realizada
A faixa vermelha da tabela de posições calculadas agora segue o **nome informado no campo "Chefe / referência central"**.

## Antes
O destaque era aplicado na posição central gerada anteriormente (`slot === 0`).

## Agora
O destaque é aplicado na linha cujo nome do mestre corresponde ao chefe selecionado no formulário.

## Arquivo alterado
- `components/PositionPage.tsx`
