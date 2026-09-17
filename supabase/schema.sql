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
