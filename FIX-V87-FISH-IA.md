# V87 — FISH IA

Continuação direta da V86.

## O que mudou

- O antigo Painel/Pilot IA foi removido da interface.
- Novo assistente **FISH IA** em botão flutuante.
- Janela limpa: sem cabeçalho, sem cards, sem perguntas prontas, sem mensagem automática de boas-vindas.
- A conversa começa vazia e só aparece conteúdo depois que o usuário escreve.
- Tipografia grande no chat e na caixa de mensagem.
- Resposta otimizada para velocidade: esforço de raciocínio padrão `low`, saída curta por padrão e consulta ao histórico do banco apenas quando a pergunta realmente depende dos dados da viagem/largadas.
- Personalidade de pescador experiente, direta e natural.
- Especialização central em **corvina (Micropogonias furnieri)**, hábitos diários, Lua, maré, vento, temperatura da água, clorofila e leitura operacional dos dados do painel.
- A FISH IA também conhece a navegação e os módulos do Painel de Bordo para orientar o usuário quando ele pedir ajuda.
- Nenhuma mensagem de interface apresenta indicação de gratuidade ou cobrança da FISH IA.
- O saldo de créditos continua reservado para o AIS.

## Controle por usuário

A tabela `credit_wallets` ganhou a coluna:

```sql
fish_ai_enabled boolean not null default true
```

No painel administrativo, cada usuário tem um botão individual:

- **FISH IA LIGADA**
- **FISH IA DESLIGADA**

Quando desligada, a API bloqueia a FISH IA para aquele usuário e o botão flutuante desaparece após a verificação de acesso.

A migração também está em `supabase/v87-fish-ai.sql`.

## Variáveis opcionais

```env
FISH_AI_MODEL=gpt-5.6-sol
FISH_AI_REASONING_EFFORT=low
```

Se `FISH_AI_MODEL` não for definido, o sistema usa `OPENAI_MODEL`.
