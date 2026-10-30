# V232 — Rumo calculado automaticamente

- Removida a edição manual do rumo na página Posição.
- O rumo inicial verdadeiro agora é calculado das duas coordenadas WGS84 informadas, usando a função geodésica existente.
- Atualização imediata do rumo ao editar qualquer ponta.
- O mesmo rumo calculado, sem arredondamento, é aplicado à geração de todas as posições paralelas.
- Campo somente leitura; exibição em graus com duas casas decimais.
- Alterar as pontas invalida os resultados gerados até clicar em **Atualizar posições**; exportar permanece bloqueado nesse intervalo.
- Turmas antigas continuam carregáveis; seu rumo salvo não substitui o novo rumo calculado.

**Atenção:** rumo entre duas coordenadas é o rumo inicial geodésico, não uma confirmação de alinhamento em carta ou de segurança. Confira sempre coordenadas e afastamentos na carta náutica atualizada.

Validação: sintaxe TSX conferida. Build completo não executado neste ambiente sem dependências do projeto instaladas.
