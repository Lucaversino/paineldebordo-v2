-- PAINEL DE BORDO V84
-- Fallback manual. A aplicação já executa esta migração automaticamente.
-- O crédito inicial de 80 do Super Admin é concedido pela aplicação ao autenticar,
-- com marca idempotente ADMIN_INITIAL_CREDITS_V84. Não é necessário informar e-mail aqui.

update public.credit_wallets
set
  free_ais_access = false,
  free_ai_access = false,
  updated_at = CURRENT_TIMESTAMP::text
where free_ais_access = true or free_ai_access = true;

insert into public.billing_settings(key, value)
values ('BILLING_SCHEMA_VERSION', '84')
on conflict (key) do update
set value = excluded.value,
    updated_at = CURRENT_TIMESTAMP::text;
