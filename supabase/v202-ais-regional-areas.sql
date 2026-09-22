-- V202 — buscas AIS 30 MN por usuário + áreas AIS administrativas 80 MN.
-- O aplicativo acessa estas tabelas somente pelas rotas server-side autenticadas.

create table if not exists public.ais_area_searches (
  id bigserial primary key,
  owner_id text not null,
  mode text not null default 'free',
  center_latitude double precision not null,
  center_longitude double precision not null,
  radius_nm double precision not null default 30,
  credits_used integer not null default 0,
  vessel_count integer not null default 0,
  source text,
  vessels_json text not null default '[]',
  searched_at text not null default CURRENT_TIMESTAMP::text
);

create index if not exists idx_ais_area_searches_owner_time
  on public.ais_area_searches(owner_id, id desc);

alter table public.ais_area_searches enable row level security;

create table if not exists public.ais_admin_regional_areas (
  id bigserial primary key,
  name text not null,
  center_latitude double precision not null,
  center_longitude double precision not null,
  radius_nm double precision not null default 80,
  auto_update boolean not null default true,
  visible boolean not null default true,
  vessel_count integer not null default 0,
  source text,
  vessels_json text not null default '[]',
  created_by text not null,
  created_at text not null default CURRENT_TIMESTAMP::text,
  updated_at text not null default CURRENT_TIMESTAMP::text,
  last_refreshed_at text,
  last_attempt_at text
);

create index if not exists idx_ais_admin_regional_visible
  on public.ais_admin_regional_areas(visible, id desc);
create index if not exists idx_ais_admin_regional_auto
  on public.ais_admin_regional_areas(auto_update, id);

alter table public.ais_admin_regional_areas enable row level security;
