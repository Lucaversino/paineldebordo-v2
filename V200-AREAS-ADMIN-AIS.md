# V200 — Áreas / Reservas Administrativas no AIS

- Base: V199.
- Somente Super Admin pode desenhar, salvar, editar, ocultar e apagar áreas oficiais.
- Desenho direto no AIS pelo botão **ÁREA**.
- Cada toque/clique adiciona um vértice numerado.
- A partir de 3 pontos, o administrador pode **FECHAR E SALVAR**.
- Cores: verde, amarelo e vermelho.
- Os vértices salvos continuam visíveis como pequenos waypoints circulares, lembrando plotter marítimo.
- Transparência ajustável de 0% a 100%. O contorno permanece visível mesmo com 100% de transparência do preenchimento.
- Áreas salvas aparecem automaticamente para os usuários no AIS.
- Gestão adicional no painel administrativo: nome, cor, transparência, visibilidade e exclusão.
- Banco separado `official_areas`; não mistura com waypoints pessoais ou waypoints oficiais.
- API protege alterações e exclusões com validação de Super Admin no servidor.
- V199 (ícones oficiais e scroll desktop), V197 (mapa livre em navegação), batimetria, AIS, GPS, rotas, XTE, créditos e demais módulos preservados.
