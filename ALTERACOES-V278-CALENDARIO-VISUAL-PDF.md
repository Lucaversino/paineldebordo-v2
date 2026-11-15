# V278 — Calendário VISUAL da viagem dentro do PDF

## Correção da falha relatada
A V277 exportava apenas uma tabela de ocorrências ao final do PDF. Nesta versão, a exportação insere **uma página de calendário por mês abrangido pela viagem**, com grade de segunda-feira a domingo, dias da viagem, número de largadas, produção diária, indicação de dia perdido e indicação de anotação. Em seguida, inclui o diário cronológico completo com datas, capturas por categoria e textos completos das anotações.

## Como conferir
1. Executar `supabase/V277-CALENDARIO-PERSISTENTE.sql` no banco da aplicação (apenas se ainda não executado). Não execute em outro projeto Supabase.
2. Publicar **o código V278** na aplicação. PDFs de versões já publicadas não são atualizados automaticamente.
3. Abrir a viagem em andamento, registrar uma anotação no Calendário e confirmar "Salvo no banco de dados da sua conta".
4. Ir a **Viagens / Exportar PDF** da mesma viagem, gerar e abrir o PDF recém-baixado, rolando até as últimas páginas. Conferir os títulos "CALENDÁRIO DA VIAGEM" e "DIÁRIO CRONOLÓGICO".
5. Conferir em outro dispositivo com mesma conta; comparar dias perdidos, produção e anotações. Repetir com viagem finalizada.
6. Compartilhar o PDF pelo WhatsApp no dispositivo real e confirmar que o arquivo recebido contém todas as páginas. Caso o navegador não suporte anexos via compartilhamento nativo, usar o download e anexar documento manualmente.

## Observações
- Meses exibidos incluem o período entre partida e retorno efetivo, ou até a data de emissão para viagem em andamento, além dos meses com registros operacionais.
- No calendário, "produção" representa corvina + mistura; descarte está no diário cronológico.
- A V278 mantém a API e a tabela de calendário da V277. Não existe mudança de esquema adicional.
- O PDF é gerado no navegador. Se a migração de banco não foi aplicada, a exportação deve mostrar erro em vez de omitir dados silenciosamente.
- Testes de ponta a ponta no Supabase/WhatsApp de produção exigem acesso ao ambiente publicado e dispositivos reais. Compilação completa não foi executada neste ambiente devido à ausência de `node_modules`.
