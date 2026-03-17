-- @summit/chassis - Migration 00014: Fleet Core Domain Tables
--
-- Creates: assets, work_orders, inspections, inspection_defects, maintenance_schedules
-- Depends on: 00013 (enum types)
--
-- This migration is idempotent (safe to run multiple times).

-- ============================================================================
-- 1. assets
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.assets (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       UUID NOT NULL,
  asset_class     asset_class_enum NOT NULL,
  status          asset_status_enum NOT NULL DEFAULT 'pending',
  name            TEXT,
  vin             TEXT,
  serial_number   TEXT,
  license_plate   TEXT,
  year            TEXT,
  make            TEXT,
  model           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'assets' AND policyname = 'assets_service_role_all'
  ) THEN
    CREATE POLICY assets_service_role_all ON public.assets
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'assets' AND policyname = 'assets_tenant_isolation'
  ) THEN
    CREATE POLICY assets_tenant_isolation ON public.assets
      FOR ALL TO authenticated
      USING (tenant_id = (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'tenant_id')::UUID)
      WITH CHECK (tenant_id = (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'tenant_id')::UUID);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_assets_tenant_id
  ON public.assets (tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_tenant_vin
  ON public.assets (tenant_id, vin) WHERE vin IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_tenant_serial_number
  ON public.assets (tenant_id, serial_number) WHERE serial_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_tenant_license_plate
  ON public.assets (tenant_id, license_plate) WHERE license_plate IS NOT NULL;

CREATE OR REPLACE TRIGGER trg_assets_updated_at
  BEFORE UPDATE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- ============================================================================
-- 2. work_orders
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.work_orders (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       UUID NOT NULL,
  asset_id        UUID NOT NULL REFERENCES public.assets(id),
  status          work_order_status_enum NOT NULL DEFAULT 'open',
  priority        TEXT,
  description     TEXT,
  assigned_to     UUID,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'work_orders' AND policyname = 'work_orders_service_role_all'
  ) THEN
    CREATE POLICY work_orders_service_role_all ON public.work_orders
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'work_orders' AND policyname = 'work_orders_tenant_isolation'
  ) THEN
    CREATE POLICY work_orders_tenant_isolation ON public.work_orders
      FOR ALL TO authenticated
      USING (tenant_id = (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'tenant_id')::UUID)
      WITH CHECK (tenant_id = (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'tenant_id')::UUID);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_work_orders_tenant_id
  ON public.work_orders (tenant_id);

CREATE INDEX IF NOT EXISTS idx_work_orders_asset_id
  ON public.work_orders (asset_id);

CREATE INDEX IF NOT EXISTS idx_work_orders_tenant_status
  ON public.work_orders (tenant_id, status);

CREATE OR REPLACE TRIGGER trg_work_orders_updated_at
  BEFORE UPDATE ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- ============================================================================
-- 3. inspections
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.inspections (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       UUID NOT NULL,
  asset_id        UUID NOT NULL REFERENCES public.assets(id),
  inspector_id    UUID,
  status          inspection_status_enum NOT NULL DEFAULT 'pending',
  type            TEXT,
  notes           TEXT,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'inspections' AND policyname = 'inspections_service_role_all'
  ) THEN
    CREATE POLICY inspections_service_role_all ON public.inspections
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'inspections' AND policyname = 'inspections_tenant_isolation'
  ) THEN
    CREATE POLICY inspections_tenant_isolation ON public.inspections
      FOR ALL TO authenticated
      USING (tenant_id = (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'tenant_id')::UUID)
      WITH CHECK (tenant_id = (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'tenant_id')::UUID);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_inspections_tenant_id
  ON public.inspections (tenant_id);

CREATE INDEX IF NOT EXISTS idx_inspections_asset_id
  ON public.inspections (asset_id);

CREATE INDEX IF NOT EXISTS idx_inspections_tenant_status
  ON public.inspections (tenant_id, status);

CREATE OR REPLACE TRIGGER trg_inspections_updated_at
  BEFORE UPDATE ON public.inspections
  FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- ============================================================================
-- 4. inspection_defects
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.inspection_defects (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       UUID NOT NULL,
  inspection_id   UUID NOT NULL REFERENCES public.inspections(id),
  work_order_id   UUID REFERENCES public.work_orders(id),
  severity        defect_severity_enum NOT NULL DEFAULT 'low',
  description     TEXT,
  resolved        BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.inspection_defects ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'inspection_defects' AND policyname = 'inspection_defects_service_role_all'
  ) THEN
    CREATE POLICY inspection_defects_service_role_all ON public.inspection_defects
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'inspection_defects' AND policyname = 'inspection_defects_tenant_isolation'
  ) THEN
    CREATE POLICY inspection_defects_tenant_isolation ON public.inspection_defects
      FOR ALL TO authenticated
      USING (tenant_id = (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'tenant_id')::UUID)
      WITH CHECK (tenant_id = (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'tenant_id')::UUID);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_inspection_defects_tenant_id
  ON public.inspection_defects (tenant_id);

CREATE INDEX IF NOT EXISTS idx_inspection_defects_inspection_id
  ON public.inspection_defects (inspection_id);

CREATE INDEX IF NOT EXISTS idx_inspection_defects_work_order_id
  ON public.inspection_defects (work_order_id) WHERE work_order_id IS NOT NULL;

CREATE OR REPLACE TRIGGER trg_inspection_defects_updated_at
  BEFORE UPDATE ON public.inspection_defects
  FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- ============================================================================
-- 5. maintenance_schedules
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.maintenance_schedules (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id           UUID NOT NULL,
  asset_id            UUID NOT NULL REFERENCES public.assets(id),
  schedule_type       schedule_type_enum NOT NULL,
  interval_value      INT NOT NULL,
  last_performed_at   TIMESTAMPTZ,
  next_due_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.maintenance_schedules ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'maintenance_schedules' AND policyname = 'maintenance_schedules_service_role_all'
  ) THEN
    CREATE POLICY maintenance_schedules_service_role_all ON public.maintenance_schedules
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'maintenance_schedules' AND policyname = 'maintenance_schedules_tenant_isolation'
  ) THEN
    CREATE POLICY maintenance_schedules_tenant_isolation ON public.maintenance_schedules
      FOR ALL TO authenticated
      USING (tenant_id = (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'tenant_id')::UUID)
      WITH CHECK (tenant_id = (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'tenant_id')::UUID);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_maintenance_schedules_tenant_id
  ON public.maintenance_schedules (tenant_id);

CREATE INDEX IF NOT EXISTS idx_maintenance_schedules_asset_id
  ON public.maintenance_schedules (asset_id);

CREATE INDEX IF NOT EXISTS idx_maintenance_schedules_tenant_next_due
  ON public.maintenance_schedules (tenant_id, next_due_at);

CREATE OR REPLACE TRIGGER trg_maintenance_schedules_updated_at
  BEFORE UPDATE ON public.maintenance_schedules
  FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
