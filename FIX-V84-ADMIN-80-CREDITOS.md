# PAINEL DE BORDO — V84 — ADMIN COM 80 CRÉDITOS

Esta versão continua diretamente a V83 e altera somente o modelo de créditos/administrador, preservando as demais funções do Painel de Bordo.

## O que mudou

- O Super Admin não possui mais AIS/IA grátis.
- Na primeira inicialização da carteira na V84, o Super Admin recebe saldo inicial de **80 créditos**.
- Esse crédito inicial é concedido **uma única vez**, identificado no extrato pela referência `ADMIN_INITIAL_CREDITS_V84`.
- Depois disso, AIS e Painel IA descontam créditos do administrador pelas mesmas regras configuradas no painel.
- Falhas de provedor, timeout ou respostas inválidas continuam sem descontar crédito quando a cobrança ocorre somente após sucesso.

## Painel administrativo de créditos

Dentro de **Admin — AIS, IA e Créditos** foi adicionada a área **Gestão manual — Créditos dos usuários**.

O administrador pode:

- visualizar usuários e saldo atual;
- buscar por e-mail ou ID do usuário;
- adicionar rapidamente +10, +20, +50 ou +100 créditos;
- informar qualquer valor de 1 a 100.000 créditos;
- inserir uma observação opcional;
- acompanhar o total de créditos concedidos manualmente separado do total vendido.

Cada crédito manual gera uma linha em `credit_transactions` com `kind = 'admin_credit'`, saldo resultante e metadados do administrador que realizou a operação.

## Variável opcional

No ambiente de produção, o saldo inicial pode ser alterado com:

```env
ADMIN_INITIAL_CREDITS=80
```

Se a variável não existir, o sistema usa 80.

## Migração automática

Ao detectar uma versão anterior do billing, a aplicação:

1. desativa `free_ais_access` e `free_ai_access` de todas as carteiras;
2. atualiza `BILLING_SCHEMA_VERSION` para `84`;
3. mantém os saldos existentes;
4. concede o saldo inicial do Super Admin somente quando a marca V84 ainda não existir.

Também existe `supabase/v84-admin-80-creditos.sql` como fallback manual para a parte de migração das flags/schema.
