-- Execute uma vez no SQL Editor do Supabase ANTES de publicar a V277.
-- A API acessa esta tabela pelo DATABASE_URL autenticado e confere owner_id nas consultas.
CREATE TABLE IF NOT EXISTS public.trip_calendar_days (
  id SERIAL PRIMARY KEY,
  owner_id TEXT NOT NULL,
  trip_id INTEGER NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  day TEXT NOT NULL CHECK (day ~ '^\d{4}-\d{2}-\d{2}$'),
  note TEXT NOT NULL DEFAULT '',
  lost_reason TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT trip_calendar_note_length CHECK (char_length(note) <= 3000),
  CONSTRAINT trip_calendar_lost_length CHECK (char_length(lost_reason) <= 120)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_calendar_owner_trip_day ON public.trip_calendar_days(owner_id, trip_id, day);
CREATE INDEX IF NOT EXISTS idx_trip_calendar_trip ON public.trip_calendar_days(trip_id);
ALTER TABLE public.trip_calendar_days ENABLE ROW LEVEL SECURITY;
-- Defesa em profundidade para acesso direto do usuário autenticado via Supabase.
DROP POLICY IF EXISTS trip_calendar_own_records ON public.trip_calendar_days;
CREATE POLICY trip_calendar_own_records ON public.trip_calendar_days FOR ALL TO authenticated
USING (owner_id = auth.uid()::text AND EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND t.owner_id = auth.uid()::text))
WITH CHECK (owner_id = auth.uid()::text AND EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND t.owner_id = auth.uid()::text));
