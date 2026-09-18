# V88 — FISH AI com cabeçalho e histórico de conversas

Continuação direta da V87.

## Alterações

- Cabeçalho da janela agora mostra **FISH AI**.
- Botão **Limpar conversa** no cabeçalho.
- Botão em formato de pasta para abrir o **Histórico de conversas**.
- Cada conversa é salva automaticamente no navegador para o usuário autenticado.
- Histórico mostra data e hora da última mensagem.
- A primeira pergunta vira o título resumido da conversa.
- Clicar em uma conversa restaura todo o contexto salvo.
- Cada conversa possui botão individual para excluir.
- Limpar a conversa abre uma conversa nova sem apagar as conversas anteriores do histórico.
- Até 50 conversas são preservadas por usuário e até 40 mensagens por conversa.
- Conversas antigas da V87 são importadas na primeira abertura quando disponíveis.
- A FISH AI continua sem mensagens prontas e mantém a caixa de conversa com letras grandes.

## Armazenamento

O histórico é armazenado em `localStorage` separado por ID do usuário autenticado. Isso evita misturar o histórico de contas diferentes usadas no mesmo navegador.
