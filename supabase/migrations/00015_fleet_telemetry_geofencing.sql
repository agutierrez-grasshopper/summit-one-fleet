-- @summit/chassis - Migration 00015: Fleet Telemetry & Geofencing Tables
--
-- Creates: telemetry_data, geofences, geofence_events
-- Depends on: 00013 (enum types), 00014 (assets)
--
-- This migration is idempotent (safe to run multiple times).

-- ============================================================================
-- 1. telemetry_data (append-only, high-volume)
-- ============================================================================
-- NOTE: For production workloads, consider partitioning this table by
-- recorded_at (e.g., monthly range partitions) for retention management
-- and query performance on large datasets.

CREATE TABLE IF NOT EXISTS public.telemetry_data (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   UUID NOT NULL,
  asset_id    UUID NOT NULL REFERENCES public.assets(id),
  latitude    DOUBLE PRECISION,
  longitude   DOUBLE PRECISION,
  speed       DOUBLE PRECISION,
  heading     DOUBLE PRECISION,
  engine_hours DOUBLE PRECISION,
  odometer    DOUBLE PRECISION,
  fuel_level  DOUBLE PRECISION,
  raw_data    JSONB,
  recorded_at TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  -- No updated_at: telemetry is append-only
);

-- Enable RLS
ALTER TABLE public.telemetry_data ENABLE ROW LEVEL SECURITY;

-- Service role: full access
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'telemetry_data' AND policyname = 'telemetry_data_service_role_all'
  ) THEN
    CREATE POLICY telemetry_data_service_role_all ON public.telemetry_data
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Authenticated users: tenant-scoped SELECT
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'telemetry_data' AND policyname = 'telemetry_data_tenant_select'
  ) THEN
    CREATE POLICY telemetry_data_tenant_select ON public.telemetry_data
      FOR SELECT TO authenticated
      USING (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'telemetry_data' AND policyname = 'telemetry_data_tenant_insert'
  ) THEN
    CREATE POLICY telemetry_data_tenant_insert ON public.telemetry_data
      FOR INSERT TO authenticated
      WITH CHECK (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid);
  END IF;
END $$;

-- Indexes for telemetry queries
CREATE INDEX IF NOT EXISTS idx_telemetry_data_tenant_asset_recorded
  ON public.telemetry_data (tenant_id, asset_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_telemetry_data_asset_recorded
  ON public.telemetry_data (asset_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_telemetry_data_tenant_recorded
  ON public.telemetry_data (tenant_id, recorded_at DESC);

-- ============================================================================
-- 2. geofences
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.geofences (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   UUID NOT NULL,
  name        TEXT NOT NULL,
  shape       geofence_shape_enum NOT NULL,
  coordinates JSONB NOT NULL,
  radius      DOUBLE PRECISION,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.geofences ENABLE ROW LEVEL SECURITY;

-- Service role: full access
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'geofences' AND policyname = 'geofences_service_role_all'
  ) THEN
    CREATE POLICY geofences_service_role_all ON public.geofences
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Authenticated users: tenant-scoped access
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'geofences' AND policyname = 'geofences_tenant_select'
  ) THEN
    CREATE POLICY geofences_tenant_select ON public.geofences
      FOR SELECT TO authenticated
      USING (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'geofences' AND policyname = 'geofences_tenant_insert'
  ) THEN
    CREATE POLICY geofences_tenant_insert ON public.geofences
      FOR INSERT TO authenticated
      WITH CHECK (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'geofences' AND policyname = 'geofences_tenant_update'
  ) THEN
    CREATE POLICY geofences_tenant_update ON public.geofences
      FOR UPDATE TO authenticated
      USING (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid)
      WITH CHECK (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid);
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_geofences_tenant_id
  ON public.geofences (tenant_id);

CREATE INDEX IF NOT EXISTS idx_geofences_tenant_active
  ON public.geofences (tenant_id, active);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_geofences_updated_at ON public.geofences;
CREATE TRIGGER trg_geofences_updated_at
  BEFORE UPDATE ON public.geofences
  FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- ============================================================================
-- 3. geofence_events (append-only)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.geofence_events (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   UUID NOT NULL,
  asset_id    UUID NOT NULL REFERENCES public.assets(id),
  geofence_id UUID NOT NULL REFERENCES public.geofences(id),
  event_type  geofence_event_type_enum NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  -- No updated_at: geofence events are append-only
);

-- Enable RLS
ALTER TABLE public.geofence_events ENABLE ROW LEVEL SECURITY;

-- Service role: full access
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'geofence_events' AND policyname = 'geofence_events_service_role_all'
  ) THEN
    CREATE POLICY geofence_events_service_role_all ON public.geofence_events
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Authenticated users: tenant-scoped access
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'geofence_events' AND policyname = 'geofence_events_tenant_select'
  ) THEN
    CREATE POLICY geofence_events_tenant_select ON public.geofence_events
      FOR SELECT TO authenticated
      USING (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'geofence_events' AND policyname = 'geofence_events_tenant_insert'
  ) THEN
    CREATE POLICY geofence_events_tenant_insert ON public.geofence_events
      FOR INSERT TO authenticated
      WITH CHECK (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid);
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_geofence_events_tenant_id
  ON public.geofence_events (tenant_id);

CREATE INDEX IF NOT EXISTS idx_geofence_events_tenant_asset_recorded
  ON public.geofence_events (tenant_id, asset_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_geofence_events_geofence_recorded
  ON public.geofence_events (geofence_id, recorded_at DESC);
