# V203 — Fix bug da busca GFW

- Corrigido bug visual da barra de busca na aba **Global Fishing Watch · FREE** no desktop e no celular.
- Causa: o formulário usava o layout `ais-v138-free-form`, que espera 3 colunas (ícone + input + botão), mas a aba GFW estava renderizando apenas input + botão.
- Correção: incluído o ícone de busca na aba GFW e ajuste leve de CSS local para manter largura e botão estáveis.
- Não altera a busca FREE principal em **Outras fontes**.
