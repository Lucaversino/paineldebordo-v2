# V277 — Calendário persistente + diário completo no PDF + compartilhamento

## Implantação obrigatória
1. Antes de publicar o código, execute `supabase/V277-CALENDARIO-PERSISTENTE.sql` no SQL Editor do **mesmo projeto Supabase** usado por `DATABASE_URL`.
2. Publique o novo código. O backend usa a sessão autenticada e sempre valida o proprietário da viagem.
3. Confira uma viagem em andamento: marque dia perdido e salve anotação, recarregue e abra em outro dispositivo com a mesma conta.
4. Gere o PDF pela viagem atual e confira a última seção, **Calendário e diário da viagem**, inclusive dias sem pesca.
5. Teste o compartilhamento no Android e no iPhone reais, em contexto HTTPS/PWA: a tela nativa deve oferecer WhatsApp se o sistema suportar compartilhamento de arquivo PDF. Escolha contato e confirme o envio dentro do WhatsApp.
6. No PC, baixe o arquivo, abra WhatsApp Web e anexe o PDF como Documento (nenhum navegador pode garantir anexo automático no WhatsApp Web).

## Comportamento e limites
- Anotações e dias perdidos são enviados para `trip_calendar_days` por `owner_id + trip_id + day`; salvamento só é confirmado após resposta positiva do banco. Não há falso sucesso local.
- Registros antigos deste navegador são importados para a conta no primeiro acesso quando não conflitam com valores já salvos remotamente. Dados antigos não são apagados.
- Se o banco estiver indisponível ou a migração não for executada, a edição é bloqueada e a geração do PDF acusa erro para evitar emitir histórico incompleto.
- A última seção do PDF lista cada dia da viagem, largadas, produção Corvina/Mistura/Descarte, dias perdidos e anotações. O período é limitado a 366 dias para evitar relatórios excessivos.
- Previsão meteorológica futura da tela de calendário não vira fato histórico; para snapshots ambientais há a exportação opcional preexistente.
- Compartilhamento por arquivo é sujeito ao suporte e ao aplicativo escolhido no sistema operacional. Não há como garantir a entrega no WhatsApp sem confirmação no próprio aplicativo.

## Verificações necessárias
- Instalar dependências (`npm ci`) e executar `npm run typecheck` e `npm run build` em ambiente de projeto com Node compatível.
- Testar sessões expirada, viagem pertencente a outro usuário, falha de rede, PDF extenso, troca de aparelhos e cancelamento do compartilhamento.
