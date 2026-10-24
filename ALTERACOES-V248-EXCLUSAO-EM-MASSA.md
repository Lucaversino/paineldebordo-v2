# V248 — seleção e exclusão em massa de Waypoints Oficiais

Base: V247.

- Checkbox individual por waypoint e opção "Selecionar todos" na lista atual.
- Contador de itens selecionados, botão "Excluir selecionados" e confirmação obrigatória.
- Endpoint POST /api/official-waypoints/bulk-delete com limite de 200 IDs únicos por requisição.
- A API exige autenticação de superadministrador e restringe remoção ao `created_by` da conta autenticada.
- Operações maiores são enviadas em lotes, com atualização de seleção e lista após cada lote.
- Mantidas as funções anteriores de importação GPX, visibilidade pública/particular, símbolos e exclusão individual.

Atenção: exclusão definitiva. Faça backup antes de usar. Não foi possível executar o build completo sem node_modules.
