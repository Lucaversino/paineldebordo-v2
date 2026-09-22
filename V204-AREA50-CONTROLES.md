# V204 — controles da lista 50 km

## Ajustes pedidos
- adicionada opção de **excluir cada barco** da lista temporária de resultados **50 km**;
- adicionada opção de **EXCLUIR TODOS** os barcos da lista 50 km;
- adicionada regra de retenção: a lista **apaga automaticamente em 8 horas**;
- adicionada mensagem avisando que os resultados são temporários e expiram em 8 horas;
- adicionando botão **SALVAR** em cada barco da lista 50 km para mover para a pasta normal de **Barcos salvos**;
- a pasta normal **Barcos salvos** agora mostra apenas os barcos realmente salvos, sem misturar com a lista temporária de 50 km.

## Arquivos principais alterados
- `components/AISPage.tsx`
- `app/api/ais-library/route.ts`
- `app/globals.css`
