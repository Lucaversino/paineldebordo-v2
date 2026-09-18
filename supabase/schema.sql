-- PAINEL DE BORDO — Supabase/PostgreSQL
-- Execute no Supabase > SQL Editor antes do primeiro uso.

create table if not exists public.boats (
  id serial primary key,
  owner_id text,
  name text not null,
  registration text not null,
  owner text,
  home_port text,
  storage_capacity_kg double precision,
  length_meters double precision,
  active boolean not null default true,
  notes text,
  created_at text not null default CURRENT_TIMESTAMP::text
);
create unique index if not exists idx_boats_owner_registration on public.boats(owner_id, registration);
create index if not exists idx_boats_owner on public.boats(owner_id);

create table if not exists public.species (
  id serial primary key,
  owner_id text,
  common_name text not null,
  scientific_name text,
  code text,
  active boolean not null default true
);
create index if not exists idx_species_owner on public.species(owner_id);

create table if not exists public.trips (
  id serial primary key,
  owner_id text,
  name text not null,
  boat_id integer not null references public.boats(id),
  departure_date text not null,
  expected_return_date text not null,
  return_date text,
  departure_port text not null,
  return_port text,
  captain text not null,
  crew_count integer not null default 1,
  target_kg double precision not null,
  primary_species_id integer references public.species(id),
  fishing_type text not null default 'Rede de emalhe',
  status text not null default 'PLANNED',
  notes text,
  deleted_at text,
  created_by text,
  updated_by text,
  created_at text not null default CURRENT_TIMESTAMP::text,
  updated_at text not null default CURRENT_TIMESTAMP::text
);
create index if not exists idx_trips_boat_status on public.trips(boat_id, status);
create index if not exists idx_trips_owner_status on public.trips(owner_id, status);

create table if not exists public.fishing_sets (
  id serial primary key,
  trip_id integer not null references public.trips(id) on delete cascade,
  set_number integer not null,
  started_at text not null,
  finished_at text,
  start_latitude double precision,
  start_longitude double precision,
  end_latitude double precision,
  end_longitude double precision,
  depth_meters double precision,
  net_length_meters double precision,
  net_height_meters double precision,
  mesh_size double precision,
  net_quantity integer,
  soak_time_minutes integer,
  water_temperature double precision,
  notes text,
  created_at text not null default CURRENT_TIMESTAMP::text,
  unique(trip_id, set_number)
);

create table if not exists public.catches (
  id serial primary key,
  trip_id integer not null references public.trips(id) on delete cascade,
  fishing_set_id integer not null references public.fishing_sets(id) on delete cascade,
  species_id integer not null references public.species(id),
  catch_type text not null default 'PRIMARY',
  weight_kg double precision not null,
  caught_at text not null,
  notes text,
  created_by text,
  created_at text not null default CURRENT_TIMESTAMP::text
);
create index if not exists idx_catches_trip_date on public.catches(trip_id, caught_at);

create table if not exists public.audit_logs (
  id serial primary key,
  user_id text,
  action text not null,
  entity text not null,
  entity_id integer,
  before_json text,
  after_json text,
  created_at text not null default CURRENT_TIMESTAMP::text
);

-- O navegador usa Supabase apenas para autenticação. As leituras/gravações de dados
-- passam pelas rotas privadas do Next.js, que validam auth.getUser() e owner_id.
-- Para reduzir exposição pelo REST automático do Supabase, habilitamos RLS sem políticas públicas.
alter table public.boats enable row level security;
alter table public.species enable row level security;
alter table public.trips enable row level security;
alter table public.fishing_sets enable row level security;
alter table public.catches enable row level security;
alter table public.audit_logs enable row level security;

-- AIS — barcos salvos e histórico por usuário (v64+)
create table if not exists public.ais_saved_vessels (
  id serial primary key,
  owner_id text not null,
  vessel_key text not null,
  name text not null,
  mmsi text,
  imo text,
  country text,
  vessel_type text,
  callsign text,
  last_latitude double precision,
  last_longitude double precision,
  last_sog double precision,
  last_cog double precision,
  last_heading double precision,
  last_destination text,
  last_status text,
  last_data_source text,
  last_position_received text,
  last_update_time text,
  saved_at text not null default CURRENT_TIMESTAMP::text,
  updated_at text not null default CURRENT_TIMESTAMP::text,
  unique(owner_id, vessel_key)
);
create index if not exists idx_ais_saved_owner_updated on public.ais_saved_vessels(owner_id, updated_at);

create table if not exists public.ais_search_history (
  id serial primary key,
  owner_id text not null,
  vessel_key text not null,
  name text not null,
  mmsi text,
  imo text,
  latitude double precision not null,
  longitude double precision not null,
  sog double precision,
  cog double precision,
  heading double precision,
  destination text,
  nav_status text,
  data_source text,
  position_received text,
  update_time text,
  queried_at text not null default CURRENT_TIMESTAMP::text
);
create index if not exists idx_ais_history_owner_time on public.ais_search_history(owner_id, queried_at);
create index if not exists idx_ais_history_owner_vessel on public.ais_search_history(owner_id, vessel_key);

alter table public.ais_saved_vessels enable row level security;
alter table public.ais_search_history enable row level security;

-- V68 — histórico de previsões e previsões salvas por usuário
create table if not exists public.forecast_history (
  id serial primary key,
  owner_id text not null,
  title text,
  latitude double precision not null,
  longitude double precision not null,
  latitude_raw text,
  longitude_raw text,
  position_label text,
  payload_json text not null,
  source text,
  created_at text not null default CURRENT_TIMESTAMP::text
);
create index if not exists idx_forecast_history_owner_time on public.forecast_history(owner_id, id desc);

create table if not exists public.saved_forecasts (
  id serial primary key,
  owner_id text not null,
  title text not null,
  latitude double precision not null,
  longitude double precision not null,
  latitude_raw text,
  longitude_raw text,
  position_label text,
  payload_json text not null,
  source text,
  created_at text not null default CURRENT_TIMESTAMP::text,
  updated_at text not null default CURRENT_TIMESTAMP::text
);
create index if not exists idx_saved_forecasts_owner_time on public.saved_forecasts(owner_id, id desc);

alter table public.forecast_history enable row level security;
alter table public.saved_forecasts enable row level security;

-- V76 — carteira única de créditos, AIS, IA e Mercado Pago
alter table public.ais_search_history add column if not exists credits_used integer not null default 0;

create table if not exists public.billing_settings (
  key text primary key,
  value text not null,
  updated_at text not null default CURRENT_TIMESTAMP::text
);
create table if not exists public.credit_wallets (
  user_id text primary key,
  email text,
  role text not null default 'user',
  balance integer not null default 0,
  ai_bonus_brl double precision not null default 0,
  ai_bonus_granted boolean not null default false,
  free_ais_access boolean not null default false,
  free_ai_access boolean not null default false,
  created_at text not null default CURRENT_TIMESTAMP::text,
  updated_at text not null default CURRENT_TIMESTAMP::text
);
create table if not exists public.credit_transactions (
  id bigserial primary key,
  user_id text not null,
  delta integer not null,
  balance_after integer not null,
  kind text not null,
  description text not null,
  amount_brl double precision,
  reference text,
  metadata_json text,
  created_at text not null default CURRENT_TIMESTAMP::text
);
create index if not exists idx_credit_transactions_user_time on public.credit_transactions(user_id, id desc);

create table if not exists public.ai_usage (
  id bigserial primary key,
  user_id text not null,
  request_type text not null,
  model text,
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  credits_charged integer not null default 0,
  estimated_api_cost_brl double precision not null default 0,
  status text not null,
  error_text text,
  created_at text not null default CURRENT_TIMESTAMP::text
);
create index if not exists idx_ai_usage_user_time on public.ai_usage(user_id, id desc);

create table if not exists public.ais_usage (
  id bigserial primary key,
  user_id text not null,
  action text not null,
  vessel_name text,
  provider_calls integer not null default 0,
  cache_hit boolean not null default false,
  credits_charged integer not null default 0,
  estimated_api_cost_brl double precision not null default 0,
  status text not null,
  error_text text,
  created_at text not null default CURRENT_TIMESTAMP::text
);
create index if not exists idx_ais_usage_user_time on public.ais_usage(user_id, id desc);

create table if not exists public.payment_orders (
  id bigserial primary key,
  external_reference text not null unique,
  preference_id text,
  payment_id text unique,
  user_id text not null,
  user_email text,
  credits integer not null,
  amount_brl double precision not null,
  status text not null default 'pending',
  created_at text not null default CURRENT_TIMESTAMP::text,
  updated_at text not null default CURRENT_TIMESTAMP::text,
  approved_at text
);
create index if not exists idx_payment_orders_user_time on public.payment_orders(user_id, id desc);

alter table public.billing_settings enable row level security;
alter table public.credit_wallets enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.ai_usage enable row level security;
alter table public.ais_usage enable row level security;
alter table public.payment_orders enable row level security;

insert into public.billing_settings(key,value) values
('CREDIT_UNIT_PRICE','1.00'),
('AIS_SINGLE_QUERY_CREDITS','2'),
('AIS_UPDATE_CREDITS','2'),
('AI_BASIC_QUERY_CREDITS','1'),
('AI_FULL_ANALYSIS_CREDITS','2'),
('AI_ADVANCED_ANALYSIS_CREDITS','3'),
('AI_WELCOME_BONUS_BRL','2.00'),
('AIS_CACHE_MINUTES','0'),
('AIS_PROVIDER_COST_PER_QUERY_BRL','0'),
('OPENAI_INPUT_COST_PER_1M','0'),
('OPENAI_OUTPUT_COST_PER_1M','0'),
('AI_BASIC_MODEL',''),
('AI_FULL_MODEL',''),
('AI_ADVANCED_MODEL','')
on conflict (key) do nothing;


-- V78 — snapshots ambientais persistidos por largada
create table if not exists public.environmental_snapshots (
  id serial primary key, owner_id text not null, trip_id integer not null, fishing_set_id integer not null,
  latitude double precision, longitude double precision, reference_time text not null, source_mode text not null,
  status text not null default 'PENDING', wind_speed_kmh double precision, wind_direction_deg double precision,
  wind_direction text, gust_kmh double precision, wave_height_m double precision, wave_direction_deg double precision,
  wave_direction text, wave_period_s double precision, swell_height_m double precision, swell_direction_deg double precision,
  swell_direction text, swell_period_s double precision, sea_temperature_c double precision, current_kmh double precision,
  current_direction_deg double precision, current_direction text, sea_level_msl_m double precision,
  chlorophyll_mg_m3 double precision, chlorophyll_time text, lunar_phase text, lunar_illumination double precision,
  sunrise text, sunset text, payload_json text, error_text text, captured_at text not null default CURRENT_TIMESTAMP::text
);
create unique index if not exists idx_env_snapshot_set on public.environmental_snapshots(fishing_set_id);
create index if not exists idx_env_snapshot_owner_trip on public.environmental_snapshots(owner_id, trip_id);
create index if not exists idx_env_snapshot_owner_status on public.environmental_snapshots(owner_id, status);
alter table public.environmental_snapshots enable row level security;
