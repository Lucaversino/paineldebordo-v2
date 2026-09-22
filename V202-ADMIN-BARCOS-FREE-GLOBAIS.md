# V202 — Barcos FREE Globais pelo Super Admin

## O que mudou
- A busca FREE principal dos usuários foi preservada.
- Não foi criada busca FREE por área de 80 milhas.
- O painel administrativo ganhou **Barcos FREE para todos**.
- O Super Admin pesquisa por nome, MMSI ou IMO usando a mesma fonte AIS FREE já configurada no painel.
- Um resultado pode ser adicionado à lista global.
- Ao adicionar, o servidor tenta obter a posição pelas fontes AIS FREE já configuradas.
- Cada barco salvo tem **ATUALIZAR**, **AUTO/MANUAL** e **EXCLUIR**.
- Os barcos com posição válida aparecem automaticamente no mapa AIS de todos os usuários logados.
- Barcos sem posição FREE permanecem na lista administrativa e podem ser atualizados depois; nenhuma posição é inventada.

## Atualização automática
- `vercel.json` registra `/api/cron/admin-free-vessels` uma vez por dia (`0 9 * * *`, UTC).
- Crie na Vercel a variável secreta `CRON_SECRET` para proteger a rota automática.
- O cron atualiza somente os barcos marcados como **AUTO**.
- O botão **Atualizar automáticos** permite atualização manual da lista sem esperar o cron.

## Banco
A tabela `public.admin_free_vessels` é criada automaticamente pelo backend na primeira utilização, seguindo o padrão já usado nas áreas e waypoints oficiais. RLS é habilitado; o navegador não escreve diretamente na tabela. Inclusão, atualização e exclusão passam pela API e exigem Super Admin.

## Preservado
- Botão e formulário **PESQUISAR BARCO FREE** do AIS.
- Aba Global Fishing Watch FREE da V201.
- PREMIUM / Data Docked e cobrança de créditos.
- AISStream, mapa, GPS, navegação, XTE, waypoints, rotas, batimetria e áreas oficiais.
