-- Restaurant Scheduler: initial schema and RLS
-- Run this in Supabase Dashboard → SQL Editor (or via Supabase CLI).

-- Employees
CREATE TABLE IF NOT EXISTS public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  title text,
  available_hours text,
  min_hours int,
  max_hours int,
  notes text,
  color text,
  food_safety_certified boolean DEFAULT false,
  unavailable_hours jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own employees"
  ON public.employees FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Shifts
CREATE TABLE IF NOT EXISTS public.shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  employee_name text NOT NULL,
  date date NOT NULL,
  start_time text NOT NULL,
  end_time text NOT NULL,
  color text,
  -- Tentative/backup shift: excluded from hours totals, shown as an outline in the UI.
  -- Optional flag, defaults to false (a normal, counted shift).
  -- Migration on existing DBs (safe, additive, idempotent):
  --   ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS tentative boolean NOT NULL DEFAULT false;
  tentative boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own shifts"
  ON public.shifts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Time off
CREATE TABLE IF NOT EXISTS public.time_off (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  employee_name text,
  date date NOT NULL,
  type text NOT NULL CHECK (type IN ('regular_off', 'custom_time_off')),
  full_day boolean DEFAULT true,
  start_time text,
  end_time text,
  reason text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.time_off ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own time_off"
  ON public.time_off FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Events
CREATE TABLE IF NOT EXISTS public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  start_date date,
  end_date date,
  all_day boolean DEFAULT true,
  start_time text,
  end_time text,
  notes text,
  color text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own events"
  ON public.events FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Store settings (one row per user in practice)
CREATE TABLE IF NOT EXISTS public.store_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_name text,
  manager_name text,
  notes text,
  monday_open text,
  monday_close text,
  tuesday_open text,
  tuesday_close text,
  wednesday_open text,
  wednesday_close text,
  thursday_open text,
  thursday_close text,
  friday_open text,
  friday_close text,
  saturday_open text,
  saturday_close text,
  sunday_open text,
  sunday_close text,
  employee_order jsonb DEFAULT '[]',
  -- Flexible extension bag for future features without schema changes.
  -- Top-level keys are namespaced by feature:
  --   week_notes: { "yyyy-MM-dd": "text" }  (keyed by week Monday date)
  --   day_notes:  { "yyyy-MM-dd": "text" }  (future)
  -- Migration: added via 3-step ALTER (add nullable -> backfill -> NOT NULL).
  -- No column DEFAULT in Postgres - always pass metadata: {} on INSERT.
  metadata jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own store_settings"
  ON public.store_settings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Indexes for common filters
CREATE INDEX IF NOT EXISTS idx_shifts_user_date ON public.shifts (user_id, date);
CREATE INDEX IF NOT EXISTS idx_time_off_user_date ON public.time_off (user_id, date);
CREATE INDEX IF NOT EXISTS idx_events_user_start ON public.events (user_id, start_date);
