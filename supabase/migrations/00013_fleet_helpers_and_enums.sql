-- ============================================================================
-- @summit/chassis - Migration 00013: Fleet Helpers, Audit Functions & Domain Enums
--
-- Adds JWT helper functions (get_user_id, get_tenant_id, is_admin),
-- audit field trigger functions (set_audit_fields_on_insert/update),
-- and fleet domain enum types used by all subsequent fleet tables.
--
-- This migration is idempotent (safe to run multiple times).
-- ============================================================================

-- ============================================================================
-- 1. JWT Helper Functions
-- ============================================================================

-- Returns the authenticated user's UUID from the JWT
CREATE OR REPLACE FUNCTION get_user_id() RETURNS UUID AS $$
  SELECT auth.uid();
$$ LANGUAGE sql STABLE;

-- Returns the tenant_id from the JWT app_metadata claim
CREATE OR REPLACE FUNCTION get_tenant_id() RETURNS UUID AS $$
  SELECT (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'tenant_id')::UUID;
$$ LANGUAGE sql STABLE;

-- Returns true if the JWT app_metadata role is 'admin'
CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN AS $$
  SELECT (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role') = 'admin';
$$ LANGUAGE sql STABLE;

-- ============================================================================
-- 2. Audit Field Trigger Functions
-- ============================================================================

-- Auto-populate created_by and updated_by on INSERT from auth.uid()
CREATE OR REPLACE FUNCTION set_audit_fields_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  NEW.updated_by := COALESCE(NEW.updated_by, auth.uid());
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Auto-populate updated_by on UPDATE from auth.uid()
CREATE OR REPLACE FUNCTION set_audit_fields_on_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by := COALESCE(NEW.updated_by, auth.uid());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. Fleet Domain Enum Types
-- ============================================================================

-- asset_class_enum: classifies asset type
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'asset_class_enum') THEN
    CREATE TYPE asset_class_enum AS ENUM ('vehicle', 'trailer', 'equipment');
  END IF;
END $$;

-- asset_status_enum: lifecycle status of an asset
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'asset_status_enum') THEN
    CREATE TYPE asset_status_enum AS ENUM ('active', 'maintenance', 'down', 'retired', 'pending');
  END IF;
END $$;

-- inspection_status_enum: status of an inspection
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inspection_status_enum') THEN
    CREATE TYPE inspection_status_enum AS ENUM ('pending', 'in_progress', 'completed', 'failed');
  END IF;
END $$;

-- defect_severity_enum: severity level of a defect
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'defect_severity_enum') THEN
    CREATE TYPE defect_severity_enum AS ENUM ('low', 'medium', 'high', 'critical');
  END IF;
END $$;

-- work_order_status_enum: status of a work order
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'work_order_status_enum') THEN
    CREATE TYPE work_order_status_enum AS ENUM ('open', 'in_progress', 'completed', 'cancelled');
  END IF;
END $$;

-- schedule_type_enum: type of maintenance schedule trigger
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'schedule_type_enum') THEN
    CREATE TYPE schedule_type_enum AS ENUM ('mileage', 'time', 'hours');
  END IF;
END $$;

-- geofence_shape_enum: shape of a geofence boundary
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'geofence_shape_enum') THEN
    CREATE TYPE geofence_shape_enum AS ENUM ('circle', 'polygon', 'rectangle');
  END IF;
END $$;

-- geofence_event_type_enum: type of geofence crossing event
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'geofence_event_type_enum') THEN
    CREATE TYPE geofence_event_type_enum AS ENUM ('enter', 'exit', 'dwell');
  END IF;
END $$;

-- ============================================================================
-- 4. Bump chassis_schema_version to 13
-- ============================================================================

INSERT INTO summit_config (key, value, description) VALUES
  ('chassis_schema_version', '13'::jsonb, 'Chassis DB schema version — checked by assertChassisSchemaVersion()')
ON CONFLICT (key) DO UPDATE SET value = '13'::jsonb;
