# V225 - Largadas que terminam no dia seguinte

- Novo campo **Termina no dia seguinte (após a meia-noite)** no cadastro de largadas.
- A API salva `finishedAt` com a data correta, inclusive na virada do mês ou ano.
- O registro local/offline calcula as mesmas datas para sincronização posterior.
- A listagem mostra a data de término quando diferente da inicial.
- O PDF da viagem inclui a data de encerramento junto ao horário final.

## Exemplo
Data da largada: 19/10/2026, início: 17:00, fim: 01:30; selecionar **Termina no dia seguinte**. O horário final será salvo como 20/10/2026 01:30, duração de 8h30.

## Instalação
Substitua o código atual pelos arquivos desta versão e faça novo deploy na Vercel. Não há necessidade de alterar o banco de dados, pois o campo de encerramento já armazena data e hora.
