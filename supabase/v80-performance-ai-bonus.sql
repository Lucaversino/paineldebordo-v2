-- Fallback manual da migração V80. O aplicativo já tenta executar isso automaticamente.
alter table public.credit_wallets
  add column if not exists ai_bonus_brl double precision not null default 0,
  add column if not exists ai_bonus_granted boolean not null default false;

-- Contas que já existiam antes da V80 ficam marcadas como antigas e não recebem o bônus retroativo.
update public.credit_wallets set ai_bonus_granted = true where ai_bonus_granted = false;

insert into public.billing_settings(key,value) values
('AI_WELCOME_BONUS_BRL','2.00'),
('BILLING_SCHEMA_VERSION','80')
on conflict (key) do update set value = excluded.value, updated_at = CURRENT_TIMESTAMP::text;
