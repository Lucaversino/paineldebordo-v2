# V251 — Editar captura nas Largadas

- Adicionado botão **Editar captura** abaixo do total em kg de cada largada, inclusive em viagens arquivadas.
- Quando há um registro de captura, abre diretamente o editor existente.
- Quando há vários registros (corvina, mistura, descarte), oferece uma lista para editar individualmente sem confundir o total com o peso de uma espécie.
- O salvamento usa a API PUT `/api/manage` já existente, sobre o mesmo registro de `catches` utilizado pela aba Capturas, pela tabela Largadas e pelos totais.
- Não cria capturas duplicadas nem altera a lógica de totais: o resumo por largada soma somente registros diferentes de descarte.
- Para largadas offline ainda pendentes, o botão não é oferecido. Sem registros de captura, a janela informa como cadastrar.
- Alteração de interface somente nos componentes/Operations.tsx e app/globals.css.

**Verificação pendente:** não foram executados build e teste ponta a ponta devido à ausência de `node_modules` neste ambiente. É recomendável testar com uma largada contendo corvina, mistura e descarte antes de publicar em produção.
