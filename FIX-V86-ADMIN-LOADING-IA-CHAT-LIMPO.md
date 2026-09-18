# V86 — ADMIN SEM CARREGAMENTO INFINITO + PAINEL IA SEM ATALHOS

Continuação direta da V85.

## Painel administrativo

- O carregamento inicial agora tem timeout no navegador e no servidor.
- Se banco/API não responder, o painel mostra erro e botão **Tentar novamente** em vez de ficar eternamente em "Carregando administração...".
- O resumo administrativo e a lista de usuários são carregados separadamente.
- A tela principal abre primeiro; a lista de usuários pode terminar de carregar depois.
- A lista de usuários passou a ler `credit_wallets` diretamente, evitando a consulta a `auth.users` que podia prender o pooler do Supabase.
- Os indicadores administrativos foram consolidados em um único round-trip SQL em vez de várias consultas paralelas.
- A liberação manual de créditos atualiza o saldo AIS sem retirar o acesso gratuito ao Painel IA.
- O endpoint de sessão agora informa corretamente `freeAiAccess: true`.

## Painel IA

- Removidos os quatro botões/perguntas rápidas:
  - Analisar viagem
  - Comparar viagens
  - Melhores condições
  - Próxima largada
- O usuário conversa diretamente pela caixa de mensagem.
- A IA continua gratuita e sem consumir créditos.
- Mantidos histórico da conversa, botão Limpar e Testar API.
