# V198 — Waypoints Oficiais do Administrador

Base: V197 — mapa livre durante a navegação, sem remover recursos existentes.

## Novo
- Seção **Waypoints Oficiais** dentro do painel Super Admin.
- Quatro marcadores especiais: **Caveira**, **Pedra**, **Parcel** e **Naufrágio**.
- Nome, latitude, longitude, observação e visibilidade.
- Ícones SVG próprios em `/public/icons/official-waypoints/`.
- Waypoints oficiais aparecem automaticamente no AIS para usuários autenticados.
- Toque/clique no ícone abre card somente de leitura com tipo, nome, posição e observação.
- Atualização automática da camada oficial a cada 2 minutos.
- Waypoints oficiais ficam separados dos waypoints pessoais e das rotas do usuário.

## Segurança
- GET: usuários autenticados recebem somente waypoints oficiais visíveis.
- Criar/editar/ocultar/exibir: somente o **Super Admin** configurado em `SUPER_ADMIN_EMAIL`.
- Excluir: somente o **Super Admin**, validado novamente no servidor; não depende apenas do botão da interface.
- Tabela separada `official_waypoints`, criada automaticamente no primeiro uso.

## Preservado
AIS FREE/Premium, GPS, navegação livre da V197, XTE, rotas, waypoints pessoais, batimetria/curvas, cartas DHN, créditos, pagamentos, FISH IA, viagens, capturas, relatórios e demais funções existentes.
