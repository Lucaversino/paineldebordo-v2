-- V159 — cache persistente do AISStream para o AIS FREE
create table if not exists public.ais_live_vessels (
  mmsi text primary key,
  imo text,
  name text,
  callsign text,
  vessel_type text,
  destination text,
  lat double precision not null,
  lon double precision not null,
  sog double precision,
  cog double precision,
  heading double precision,
  nav_status integer,
  nav_status_text text,
  message_type text,
  source text not null default 'AISStream',
  position_received timestamptz,
  last_seen_at timestamptz not null default now(),
  static_updated_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists idx_ais_live_vessels_last_seen on public.ais_live_vessels(last_seen_at desc);
create index if not exists idx_ais_live_vessels_lat_lon on public.ais_live_vessels(lat, lon);
alter table public.ais_live_vessels enable row level security;

create table if not exists public.ais_live_worker_status (
  service text primary key,
  connected boolean not null default false,
  subscribed boolean not null default false,
  last_message_at timestamptz,
  last_persist_at timestamptz,
  vessel_count integer not null default 0,
  reconnect_attempt integer not null default 0,
  last_error text,
  started_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.ais_live_worker_status enable row level security;
