# V191 — Descarte vivo ou morto

Base completa: V190-GPS-AJUDA-ESPECIE-LIVRE.

## Alteração

- O descarte avulso agora exige marcar `Vivo` ou `Morto`.
- O descarte informado junto com uma nova largada também oferece as duas opções.
- A condição pode ser corrigida em `Capturas > Editar`.
- A lista de capturas mostra a condição do descarte.
- O PDF final mostra `vivo` ou `morto` no descarte de cada largada e traz uma coluna `CONDIÇÃO` no resumo por espécie.
- Registros antigos sem essa informação aparecem no PDF como `NÃO INFORMADO`.

## Compatibilidade

A condição é armazenada no campo de observação já existente, com uma marca interna removida da exibição normal. Assim, esta versão não exige alteração nem comando SQL no Supabase.

GPS, Central de Ajuda, espécie principal livre e demais funções da V190 foram preservados.
