-- V87 — FISH IA: controle individual de acesso por usuário
alter table if exists public.credit_wallets
  add column if not exists fish_ai_enabled boolean not null default true;

update public.credit_wallets
set fish_ai_enabled = true
where fish_ai_enabled is null;

insert into public.billing_settings (key, value, updated_at)
values ('BILLING_SCHEMA_VERSION', '87', CURRENT_TIMESTAMP::text)
on conflict (key) do update
set value = excluded.value,
    updated_at = CURRENT_TIMESTAMP::text;
