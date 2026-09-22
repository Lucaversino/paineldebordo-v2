# V202 — AIS 30 MN + Áreas Administrativas 80 MN

## Objetivo
Expandir a V201 sem alterar o fluxo de pesquisa de embarcação FREE/GFW, o mapa, Data Docked, GPS, waypoints, rotas ou áreas administrativas já existentes.

## Usuários
- Nova pesquisa AIS FREE por área: raio fixo de **30 milhas náuticas (30 MN / 55,56 km)**.
- Busca FREE custa **0 créditos**.
- Busca AIS Premium mudou de 50 km para **30 MN (55,56 km)**.
- Busca Premium custa **10 créditos** na migração V202 e continua administrável no painel de cobrança.
- Cada busca de área FREE/PREMIUM é salva por usuário com centro, data/hora, quantidade, fonte e snapshot dos barcos.
- São mantidas as **30 buscas de área mais recentes por usuário**.
- Busca salva pode ser reaberta sem nova cobrança e pode ser excluída pelo próprio usuário.

## Administrador — áreas AIS compartilhadas
- Novo botão **ADM 80** no mapa AIS, exclusivo do super administrador.
- Define o centro pelo GPS ou pelo centro do mapa.
- Faz uma varredura de **80 MN (148,16 km)** e salva um snapshot AIS compartilhado.
- Os barcos das áreas administrativas visíveis são carregados no AIS para todos os usuários.
- Tela administrativa permite:
  - **Atualizar agora**;
  - ligar/desligar **atualização diária**;
  - mostrar/ocultar a área para usuários;
  - **Excluir** a área.
- Se uma atualização automática/manual não encontrar sinal novo, o snapshot anterior é preservado para evitar apagar uma área por falha temporária da fonte.

## Atualização diária automática
`vercel.json` contém um Cron diário:

`/api/cron/admin-ais-areas` — `0 12 * * *`

A rota atualiza somente áreas com atualização automática ligada e evita repetir a mesma área dentro de 20 horas.

Recomendado na Vercel:
- configurar `CRON_SECRET` para proteger a rota do cron;
- manter o worker AISStream/Railway alimentando `public.ais_live_vessels`.

## Banco
As tabelas são criadas automaticamente pelo servidor quando a função é usada:
- `public.ais_area_searches`
- `public.ais_admin_regional_areas`

## Segurança de regressão
A V202 adiciona as funções de área em rotas e tabelas próprias. O sistema existente de pesquisa de barco FREE/GFW, Premium/Data Docked, mapa, GPS, waypoints, navegação e áreas administrativas V200 permanece separado.
