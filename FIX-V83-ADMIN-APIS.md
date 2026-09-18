# V83 — Correção do Super Admin, AIS e Painel IA

## Diagnóstico confirmado nos logs da Vercel

- O acesso **GRÁTIS — ADMIN** estava correto na carteira interna, mas isso não torna as APIs externas gratuitas.
- O AIS depende da conta/chave da **Data Docked** continuar válida e com créditos do provedor.
- O Painel IA depende da **OPENAI_API_KEY** continuar válida, com acesso ao modelo e faturamento/limites da API OpenAI.
- Foram observados erros intermitentes `401` em `/api/ais`, indicando sessão instável entre navegador/PWA e as rotas do servidor.
- Também foram observados timeouts `504`: `/api/ais` chegou a exceder 30 s e `/api/ai-assistant` excedeu 60 s.

## Correções aplicadas

1. **Super Admin não depende mais da carteira para executar AIS e IA.**
   - Se o e-mail autenticado for o `SUPER_ADMIN_EMAIL`, o sistema pula a cobrança interna e evita consultas desnecessárias à tabela de créditos.
   - Isso reduz falhas quando o Supabase/Pooler oscilar.

2. **Autenticação reforçada no desktop e no celular/PWA.**
   - AIS e IA enviam o access token Supabase por `Authorization: Bearer` além dos cookies.
   - Em caso de 401, o navegador tenta renovar a sessão uma vez e repete a chamada.
   - O backend valida o token com um cliente Supabase sem persistência/cookies.

3. **AIS com fail-fast.**
   - Chamada Data Docked agora encerra em ~9 s, em vez de permanecer quase até o limite da Vercel.
   - Mensagens diferentes para: chave inválida, conta Data Docked sem créditos, rate limit e timeout.
   - Resposta da Data Docked aceita formatos alternativos (`detail`, `items`, `vessels`, array direto).

4. **Painel IA mais leve.**
   - Pergunta simples não carrega todo o histórico do banco.
   - Contexto passou a ter limites por modo: básico, completo e avançado.
   - Dados ambientais do banco são carregados apenas nos modos completo/avançado e priorizam a viagem atual.
   - Chamada OpenAI tem timeout controlado (~38 s), evitando estourar os 60 s da Vercel.
   - Em erro OpenAI, nenhum crédito do usuário é consumido.

5. **Diagnóstico de APIs no Admin.**
   - Novo botão `Testar APIs agora` em **Admin → AIS, IA e Créditos**.
   - Verifica:
     - Banco/Supabase;
     - Data Docked e saldo de créditos do provedor (endpoint `my-credits`, custo 0);
     - OPENAI_API_KEY e acesso ao modelo configurado.

6. **Projeto limpo.**
   - Removida pasta-fonte duplicada `v81src/` que estava dentro do ZIP anterior.

## Importante

`GRÁTIS — ADMIN` significa que a conta administrativa não gasta créditos internos do Painel. As APIs externas continuam precisando estar ativas:

- `DATADOCKED_API_KEY`
- `OPENAI_API_KEY`

Nenhuma variável nova é necessária na Vercel.
