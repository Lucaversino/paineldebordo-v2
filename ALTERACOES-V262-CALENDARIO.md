# V262 — Calendário da viagem

- Menu organizado: Dashboard → Ventos e Mar → Calendário → Ajuda.
- Nova tela mostra viagem em andamento, saída e retorno previsto, captura por data e progresso da meta e do tempo.
- Usa as capturas da viagem para calcular produção diária sem somar descartes.
- Dias perdidos são registros manuais armazenados no navegador por ID da viagem. **Não são sincronizados no Supabase entre dispositivos.**
- Previsões Open-Meteo até 7 dias a partir da última posição válida de uma largada. Não gera previsões retroativas nem afirma que existem dados quando a API falha.
- Preserva os módulos e componentes existentes; nenhuma migração de banco.
- Build não executado neste ambiente, validar npm install && npm run build e condições reais no projeto.
