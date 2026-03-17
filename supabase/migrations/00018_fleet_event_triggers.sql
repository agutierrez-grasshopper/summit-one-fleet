-- @summit/chassis - Migration 00018: Fleet Event Emission Triggers & Catalog Registration
--
-- Wires all fleet domain tables into the Summit event pipeline:
-- 1. Registers event types in event_catalog via register_event()
-- 2. Creates AFTER INSERT/UPDATE trigger functions that call emit_event()
-- 3. Attaches triggers to domain tables
--
-- This is CRITICAL for the outbox pattern — without these triggers,
-- domain writes will not produce events for downstream consumers.
--
-- Depends on: 00004 (emit_event, register_event), 00014-00016 (domain tables)
-- This migration is idempotent (safe to run multiple times).

-- ============================================================================
-- Section 1: Register event types in event_catalog
-- ============================================================================

SELECT register_event('fleet.asset.created', 'Asset created in fleet registry', NULL, 1, 'fleet', false, NULL, 'Asset Created', NULL, 'summit-one-fleet', 'asset');
SELECT register_event('fleet.asset.updated', 'Asset updated in fleet registry', NULL, 1, 'fleet', false, NULL, 'Asset Updated', NULL, 'summit-one-fleet', 'asset');
SELECT register_event('fleet.inspection.created', 'New inspection created', NULL, 1, 'fleet', false, NULL, 'Inspection Created', NULL, 'summit-one-fleet', 'inspection');
SELECT register_event('fleet.inspection.completed', 'Inspection completed', NULL, 1, 'fleet', false, NULL, 'Inspection Completed', NULL, 'summit-one-fleet', 'inspection');
SELECT register_event('fleet.work_order.created', 'Work order created', NULL, 1, 'fleet', false, NULL, 'Work Order Created', NULL, 'summit-one-fleet', 'work_order');
SELECT register_event('fleet.work_order.completed', 'Work order completed', NULL, 1, 'fleet', false, NULL, 'Work Order Completed', NULL, 'summit-one-fleet', 'work_order');
SELECT register_event('fleet.equipment.created', 'Equipment added to fleet', NULL, 1, 'fleet', false, NULL, 'Equipment Created', NULL, 'summit-one-fleet', 'equipment');
SELECT register_event('fleet.equipment.updated', 'Equipment details updated', NULL, 1, 'fleet', false, NULL, 'Equipment Updated', NULL, 'summit-one-fleet', 'equipment');
SELECT register_event('fleet.equipment_maintenance.created', 'Equipment maintenance record created', NULL, 1, 'fleet', false, NULL, 'Equipment Maintenance Created', NULL, 'summit-one-fleet', 'equipment');
SELECT register_event('fleet.geofence_event.created', 'Geofence boundary event recorded', NULL, 1, 'fleet', false, NULL, 'Geofence Event Created', NULL, 'summit-one-fleet', 'geofence');
SELECT register_event('fleet.telemetry.received', 'Telemetry data received (high-volume)', NULL, 1, 'fleet', true, 'High-volume event — consider filtering before forwarding', 'Telemetry Received', NULL, 'summit-one-fleet', 'telemetry');

-- ============================================================================
-- Section 2: Event emission trigger functions
-- ============================================================================

-- --------------------------------------------------------------------------
-- assets: created
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION emit_asset_created_event()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM emit_event(
    'fleet.asset.created',
    NEW.tenant_id::TEXT,
    to_jsonb(NEW),
    '{}'::jsonb,
    NULL,
    NEW.id::TEXT,
    1
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_asset_created ON assets;
CREATE TRIGGER trg_asset_created
  AFTER INSERT ON assets
  FOR EACH ROW EXECUTE FUNCTION emit_asset_created_event();

-- --------------------------------------------------------------------------
-- assets: updated
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION emit_asset_updated_event()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM emit_event(
    'fleet.asset.updated',
    NEW.tenant_id::TEXT,
    jsonb_build_object('new', to_jsonb(NEW), 'old', to_jsonb(OLD)),
    '{}'::jsonb,
    NULL,
    NEW.id::TEXT || ':' || extract(epoch from now())::TEXT,
    1
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_asset_updated ON assets;
CREATE TRIGGER trg_asset_updated
  AFTER UPDATE ON assets
  FOR EACH ROW EXECUTE FUNCTION emit_asset_updated_event();

-- --------------------------------------------------------------------------
-- inspections: created
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION emit_inspection_created_event()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM emit_event(
    'fleet.inspection.created',
    NEW.tenant_id::TEXT,
    to_jsonb(NEW),
    '{}'::jsonb,
    NULL,
    NEW.id::TEXT,
    1
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inspection_created ON inspections;
CREATE TRIGGER trg_inspection_created
  AFTER INSERT ON inspections
  FOR EACH ROW EXECUTE FUNCTION emit_inspection_created_event();

-- --------------------------------------------------------------------------
-- inspections: completed (conditional — only fires on status transition)
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION emit_inspection_completed_event()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM emit_event(
    'fleet.inspection.completed',
    NEW.tenant_id::TEXT,
    jsonb_build_object('new', to_jsonb(NEW), 'old', to_jsonb(OLD)),
    '{}'::jsonb,
    NULL,
    NEW.id::TEXT || ':completed',
    1
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inspection_completed ON inspections;
CREATE TRIGGER trg_inspection_completed
  AFTER UPDATE ON inspections
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
  EXECUTE FUNCTION emit_inspection_completed_event();

-- --------------------------------------------------------------------------
-- work_orders: created
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION emit_work_order_created_event()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM emit_event(
    'fleet.work_order.created',
    NEW.tenant_id::TEXT,
    to_jsonb(NEW),
    '{}'::jsonb,
    NULL,
    NEW.id::TEXT,
    1
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_work_order_created ON work_orders;
CREATE TRIGGER trg_work_order_created
  AFTER INSERT ON work_orders
  FOR EACH ROW EXECUTE FUNCTION emit_work_order_created_event();

-- --------------------------------------------------------------------------
-- work_orders: completed (conditional — only fires on status transition)
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION emit_work_order_completed_event()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM emit_event(
    'fleet.work_order.completed',
    NEW.tenant_id::TEXT,
    jsonb_build_object('new', to_jsonb(NEW), 'old', to_jsonb(OLD)),
    '{}'::jsonb,
    NULL,
    NEW.id::TEXT || ':completed',
    1
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_work_order_completed ON work_orders;
CREATE TRIGGER trg_work_order_completed
  AFTER UPDATE ON work_orders
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
  EXECUTE FUNCTION emit_work_order_completed_event();

-- --------------------------------------------------------------------------
-- equipment: created
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION emit_equipment_created_event()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM emit_event(
    'fleet.equipment.created',
    NEW.tenant_id::TEXT,
    to_jsonb(NEW),
    '{}'::jsonb,
    NULL,
    NEW.id::TEXT,
    1
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_equipment_created ON equipment;
CREATE TRIGGER trg_equipment_created
  AFTER INSERT ON equipment
  FOR EACH ROW EXECUTE FUNCTION emit_equipment_created_event();

-- --------------------------------------------------------------------------
-- equipment: updated
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION emit_equipment_updated_event()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM emit_event(
    'fleet.equipment.updated',
    NEW.tenant_id::TEXT,
    jsonb_build_object('new', to_jsonb(NEW), 'old', to_jsonb(OLD)),
    '{}'::jsonb,
    NULL,
    NEW.id::TEXT || ':' || extract(epoch from now())::TEXT,
    1
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_equipment_updated ON equipment;
CREATE TRIGGER trg_equipment_updated
  AFTER UPDATE ON equipment
  FOR EACH ROW EXECUTE FUNCTION emit_equipment_updated_event();

-- --------------------------------------------------------------------------
-- equipment_maintenance: created
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION emit_equipment_maintenance_created_event()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM emit_event(
    'fleet.equipment_maintenance.created',
    NEW.tenant_id::TEXT,
    to_jsonb(NEW),
    '{}'::jsonb,
    NULL,
    NEW.id::TEXT,
    1
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_equipment_maintenance_created ON equipment_maintenance;
CREATE TRIGGER trg_equipment_maintenance_created
  AFTER INSERT ON equipment_maintenance
  FOR EACH ROW EXECUTE FUNCTION emit_equipment_maintenance_created_event();

-- --------------------------------------------------------------------------
-- geofence_events: created
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION emit_geofence_event_created_event()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM emit_event(
    'fleet.geofence_event.created',
    NEW.tenant_id::TEXT,
    to_jsonb(NEW),
    '{}'::jsonb,
    NULL,
    NEW.id::TEXT,
    1
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_geofence_event_created ON geofence_events;
CREATE TRIGGER trg_geofence_event_created
  AFTER INSERT ON geofence_events
  FOR EACH ROW EXECUTE FUNCTION emit_geofence_event_created_event();

-- --------------------------------------------------------------------------
-- telemetry_data: received
-- --------------------------------------------------------------------------
-- NOTE: This trigger may generate high event volume. Consider disabling in production
-- or adding a filter to only emit on significant changes (e.g., speed threshold, location delta).
-- To disable: DROP TRIGGER IF EXISTS trg_telemetry_received ON telemetry_data;

CREATE OR REPLACE FUNCTION emit_telemetry_received_event()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM emit_event(
    'fleet.telemetry.received',
    NEW.tenant_id::TEXT,
    to_jsonb(NEW),
    '{}'::jsonb,
    NULL,
    NEW.id::TEXT,
    1
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  -- High-volume trigger — can be disabled per-environment by dropping the trigger.
  -- This DO block ensures idempotency even if the trigger is intentionally absent.
  EXECUTE 'DROP TRIGGER IF EXISTS trg_telemetry_received ON telemetry_data';
  EXECUTE 'CREATE TRIGGER trg_telemetry_received
    AFTER INSERT ON telemetry_data
    FOR EACH ROW EXECUTE FUNCTION emit_telemetry_received_event()';
END;
$$;

-- ============================================================================
-- Section 3: Bump schema version
-- ============================================================================

INSERT INTO summit_config (key, value, description) VALUES
  ('chassis_schema_version', '18'::jsonb, 'Chassis DB schema version')
ON CONFLICT (key) DO UPDATE SET value = '18'::jsonb;
