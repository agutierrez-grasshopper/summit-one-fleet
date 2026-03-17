-- @summit/chassis - Migration 00016: Fleet Equipment Domain Tables
--
-- Creates: equipment, equipment_documents, equipment_maintenance,
--          equipment_inspections, equipment_events
-- Depends on: 00013 (audit functions)
--
-- This migration is idempotent (safe to run multiple times).

-- ============================================================================
-- fn_update_timestamp — shared updated_at trigger function
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 1. equipment
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.equipment (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id            UUID NOT NULL,
  name                 TEXT NOT NULL,
  description          TEXT,
  type                 TEXT,
  status               TEXT NOT NULL DEFAULT 'active',
  serial_number        TEXT,
  model                TEXT,
  manufacturer         TEXT,
  purchase_date        DATE,
  warranty_expiration  DATE,
  notes                TEXT,
  created_by           UUID,
  updated_by           UUID,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_equipment_tenant_id
  ON public.equipment (tenant_id);
CREATE INDEX IF NOT EXISTS idx_equipment_tenant_status
  ON public.equipment (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_equipment_tenant_type
  ON public.equipment (tenant_id, type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_equipment_tenant_serial
  ON public.equipment (tenant_id, serial_number) WHERE serial_number IS NOT NULL;

-- RLS policies
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'equipment' AND policyname = 'equipment_service_role_all'
  ) THEN
    CREATE POLICY equipment_service_role_all ON public.equipment
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'equipment' AND policyname = 'equipment_tenant_select'
  ) THEN
    CREATE POLICY equipment_tenant_select ON public.equipment
      FOR SELECT TO authenticated
      USING (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'equipment' AND policyname = 'equipment_tenant_insert'
  ) THEN
    CREATE POLICY equipment_tenant_insert ON public.equipment
      FOR INSERT TO authenticated
      WITH CHECK (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'equipment' AND policyname = 'equipment_tenant_update'
  ) THEN
    CREATE POLICY equipment_tenant_update ON public.equipment
      FOR UPDATE TO authenticated
      USING (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid)
      WITH CHECK (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid);
  END IF;
END $$;

-- Triggers
DROP TRIGGER IF EXISTS trg_equipment_updated_at ON public.equipment;
CREATE TRIGGER trg_equipment_updated_at
  BEFORE UPDATE ON public.equipment
  FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

DROP TRIGGER IF EXISTS trg_equipment_audit_insert ON public.equipment;
CREATE TRIGGER trg_equipment_audit_insert
  BEFORE INSERT ON public.equipment
  FOR EACH ROW EXECUTE FUNCTION set_audit_fields_on_insert();

DROP TRIGGER IF EXISTS trg_equipment_audit_update ON public.equipment;
CREATE TRIGGER trg_equipment_audit_update
  BEFORE UPDATE ON public.equipment
  FOR EACH ROW EXECUTE FUNCTION set_audit_fields_on_update();

-- ============================================================================
-- 2. equipment_documents
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.equipment_documents (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     UUID NOT NULL,
  equipment_id  UUID NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  file_url      TEXT,
  file_type     TEXT,
  file_size     BIGINT,
  created_by    UUID,
  updated_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.equipment_documents ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_equipment_documents_tenant_id
  ON public.equipment_documents (tenant_id);
CREATE INDEX IF NOT EXISTS idx_equipment_documents_equipment_id
  ON public.equipment_documents (equipment_id);

-- RLS policies
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'equipment_documents' AND policyname = 'equipment_documents_service_role_all'
  ) THEN
    CREATE POLICY equipment_documents_service_role_all ON public.equipment_documents
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'equipment_documents' AND policyname = 'equipment_documents_tenant_select'
  ) THEN
    CREATE POLICY equipment_documents_tenant_select ON public.equipment_documents
      FOR SELECT TO authenticated
      USING (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'equipment_documents' AND policyname = 'equipment_documents_tenant_insert'
  ) THEN
    CREATE POLICY equipment_documents_tenant_insert ON public.equipment_documents
      FOR INSERT TO authenticated
      WITH CHECK (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'equipment_documents' AND policyname = 'equipment_documents_tenant_update'
  ) THEN
    CREATE POLICY equipment_documents_tenant_update ON public.equipment_documents
      FOR UPDATE TO authenticated
      USING (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid)
      WITH CHECK (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid);
  END IF;
END $$;

-- Triggers
DROP TRIGGER IF EXISTS trg_equipment_documents_updated_at ON public.equipment_documents;
CREATE TRIGGER trg_equipment_documents_updated_at
  BEFORE UPDATE ON public.equipment_documents
  FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

DROP TRIGGER IF EXISTS trg_equipment_documents_audit_insert ON public.equipment_documents;
CREATE TRIGGER trg_equipment_documents_audit_insert
  BEFORE INSERT ON public.equipment_documents
  FOR EACH ROW EXECUTE FUNCTION set_audit_fields_on_insert();

DROP TRIGGER IF EXISTS trg_equipment_documents_audit_update ON public.equipment_documents;
CREATE TRIGGER trg_equipment_documents_audit_update
  BEFORE UPDATE ON public.equipment_documents
  FOR EACH ROW EXECUTE FUNCTION set_audit_fields_on_update();

-- ============================================================================
-- 3. equipment_maintenance
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.equipment_maintenance (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       UUID NOT NULL,
  equipment_id    UUID NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  type            TEXT,
  description     TEXT,
  status          TEXT NOT NULL DEFAULT 'scheduled',
  scheduled_date  DATE,
  completed_date  DATE,
  cost            NUMERIC(10,2),
  notes           TEXT,
  created_by      UUID,
  updated_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.equipment_maintenance ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_equipment_maintenance_tenant_id
  ON public.equipment_maintenance (tenant_id);
CREATE INDEX IF NOT EXISTS idx_equipment_maintenance_equipment_id
  ON public.equipment_maintenance (equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_maintenance_tenant_status
  ON public.equipment_maintenance (tenant_id, status);

-- RLS policies
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'equipment_maintenance' AND policyname = 'equipment_maintenance_service_role_all'
  ) THEN
    CREATE POLICY equipment_maintenance_service_role_all ON public.equipment_maintenance
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'equipment_maintenance' AND policyname = 'equipment_maintenance_tenant_select'
  ) THEN
    CREATE POLICY equipment_maintenance_tenant_select ON public.equipment_maintenance
      FOR SELECT TO authenticated
      USING (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'equipment_maintenance' AND policyname = 'equipment_maintenance_tenant_insert'
  ) THEN
    CREATE POLICY equipment_maintenance_tenant_insert ON public.equipment_maintenance
      FOR INSERT TO authenticated
      WITH CHECK (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'equipment_maintenance' AND policyname = 'equipment_maintenance_tenant_update'
  ) THEN
    CREATE POLICY equipment_maintenance_tenant_update ON public.equipment_maintenance
      FOR UPDATE TO authenticated
      USING (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid)
      WITH CHECK (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid);
  END IF;
END $$;

-- Triggers
DROP TRIGGER IF EXISTS trg_equipment_maintenance_updated_at ON public.equipment_maintenance;
CREATE TRIGGER trg_equipment_maintenance_updated_at
  BEFORE UPDATE ON public.equipment_maintenance
  FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

DROP TRIGGER IF EXISTS trg_equipment_maintenance_audit_insert ON public.equipment_maintenance;
CREATE TRIGGER trg_equipment_maintenance_audit_insert
  BEFORE INSERT ON public.equipment_maintenance
  FOR EACH ROW EXECUTE FUNCTION set_audit_fields_on_insert();

DROP TRIGGER IF EXISTS trg_equipment_maintenance_audit_update ON public.equipment_maintenance;
CREATE TRIGGER trg_equipment_maintenance_audit_update
  BEFORE UPDATE ON public.equipment_maintenance
  FOR EACH ROW EXECUTE FUNCTION set_audit_fields_on_update();

-- ============================================================================
-- 4. equipment_inspections
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.equipment_inspections (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     UUID NOT NULL,
  equipment_id  UUID NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  inspector_id  UUID,
  status        TEXT NOT NULL DEFAULT 'pending',
  type          TEXT,
  notes         TEXT,
  completed_at  TIMESTAMPTZ,
  created_by    UUID,
  updated_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.equipment_inspections ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_equipment_inspections_tenant_id
  ON public.equipment_inspections (tenant_id);
CREATE INDEX IF NOT EXISTS idx_equipment_inspections_equipment_id
  ON public.equipment_inspections (equipment_id);

-- RLS policies
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'equipment_inspections' AND policyname = 'equipment_inspections_service_role_all'
  ) THEN
    CREATE POLICY equipment_inspections_service_role_all ON public.equipment_inspections
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'equipment_inspections' AND policyname = 'equipment_inspections_tenant_select'
  ) THEN
    CREATE POLICY equipment_inspections_tenant_select ON public.equipment_inspections
      FOR SELECT TO authenticated
      USING (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'equipment_inspections' AND policyname = 'equipment_inspections_tenant_insert'
  ) THEN
    CREATE POLICY equipment_inspections_tenant_insert ON public.equipment_inspections
      FOR INSERT TO authenticated
      WITH CHECK (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'equipment_inspections' AND policyname = 'equipment_inspections_tenant_update'
  ) THEN
    CREATE POLICY equipment_inspections_tenant_update ON public.equipment_inspections
      FOR UPDATE TO authenticated
      USING (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid)
      WITH CHECK (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid);
  END IF;
END $$;

-- Triggers
DROP TRIGGER IF EXISTS trg_equipment_inspections_updated_at ON public.equipment_inspections;
CREATE TRIGGER trg_equipment_inspections_updated_at
  BEFORE UPDATE ON public.equipment_inspections
  FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

DROP TRIGGER IF EXISTS trg_equipment_inspections_audit_insert ON public.equipment_inspections;
CREATE TRIGGER trg_equipment_inspections_audit_insert
  BEFORE INSERT ON public.equipment_inspections
  FOR EACH ROW EXECUTE FUNCTION set_audit_fields_on_insert();

DROP TRIGGER IF EXISTS trg_equipment_inspections_audit_update ON public.equipment_inspections;
CREATE TRIGGER trg_equipment_inspections_audit_update
  BEFORE UPDATE ON public.equipment_inspections
  FOR EACH ROW EXECUTE FUNCTION set_audit_fields_on_update();

-- ============================================================================
-- 5. equipment_events
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.equipment_events (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     UUID NOT NULL,
  equipment_id  UUID NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  event_type    TEXT NOT NULL,
  description   TEXT,
  metadata      JSONB,
  created_by    UUID,
  updated_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.equipment_events ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_equipment_events_tenant_id
  ON public.equipment_events (tenant_id);
CREATE INDEX IF NOT EXISTS idx_equipment_events_equipment_id
  ON public.equipment_events (equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_events_tenant_event_type
  ON public.equipment_events (tenant_id, event_type);

-- RLS policies
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'equipment_events' AND policyname = 'equipment_events_service_role_all'
  ) THEN
    CREATE POLICY equipment_events_service_role_all ON public.equipment_events
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'equipment_events' AND policyname = 'equipment_events_tenant_select'
  ) THEN
    CREATE POLICY equipment_events_tenant_select ON public.equipment_events
      FOR SELECT TO authenticated
      USING (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'equipment_events' AND policyname = 'equipment_events_tenant_insert'
  ) THEN
    CREATE POLICY equipment_events_tenant_insert ON public.equipment_events
      FOR INSERT TO authenticated
      WITH CHECK (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'equipment_events' AND policyname = 'equipment_events_tenant_update'
  ) THEN
    CREATE POLICY equipment_events_tenant_update ON public.equipment_events
      FOR UPDATE TO authenticated
      USING (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid)
      WITH CHECK (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid);
  END IF;
END $$;

-- Triggers
DROP TRIGGER IF EXISTS trg_equipment_events_updated_at ON public.equipment_events;
CREATE TRIGGER trg_equipment_events_updated_at
  BEFORE UPDATE ON public.equipment_events
  FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

DROP TRIGGER IF EXISTS trg_equipment_events_audit_insert ON public.equipment_events;
CREATE TRIGGER trg_equipment_events_audit_insert
  BEFORE INSERT ON public.equipment_events
  FOR EACH ROW EXECUTE FUNCTION set_audit_fields_on_insert();

DROP TRIGGER IF EXISTS trg_equipment_events_audit_update ON public.equipment_events;
CREATE TRIGGER trg_equipment_events_audit_update
  BEFORE UPDATE ON public.equipment_events
  FOR EACH ROW EXECUTE FUNCTION set_audit_fields_on_update();
