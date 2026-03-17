-- @summit/chassis - Migration 00004: Summit Publisher Protocol v1.2
--
-- Adds summit_config, event_catalog, events_dead_letter tables,
-- immutability triggers, expanded status CHECK on events_outbox,
-- and protocol RPC functions.
--
-- This migration is additive — it extends 00003, does NOT replace it.
-- All statements are idempotent (safe to run multiple times).

-- ============================================================================
-- 1. Generic trigger: fn_update_timestamp()
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_update_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 2. Immutability trigger: fn_prevent_event_modification()
-- ============================================================================
-- Blocks changes to envelope columns on events_outbox.
-- Allows changes to delivery-tracking columns only.
CREATE OR REPLACE FUNCTION fn_prevent_event_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.type IS DISTINCT FROM NEW.type
    OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
    OR OLD.actor IS DISTINCT FROM NEW.actor
    OR OLD.payload IS DISTINCT FROM NEW.payload
    OR OLD.version IS DISTINCT FROM NEW.version
    OR OLD.occurred_at IS DISTINCT FROM NEW.occurred_at
    OR OLD.correlation_id IS DISTINCT FROM NEW.correlation_id
    OR OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key
  THEN
    RAISE EXCEPTION 'Cannot modify immutable event envelope columns (type, tenant_id, actor, payload, version, occurred_at, correlation_id, idempotency_key)';
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 3. summit_config table (key/value config for protocol settings)
-- ============================================================================
CREATE TABLE IF NOT EXISTS summit_config (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT        NOT NULL UNIQUE,
  value       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update updated_at
DROP TRIGGER IF EXISTS trg_summit_config_updated_at ON summit_config;
CREATE TRIGGER trg_summit_config_updated_at
  BEFORE UPDATE ON summit_config
  FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- Seed rows (idempotent via ON CONFLICT)
INSERT INTO summit_config (key, value, description) VALUES
  ('publisher_version', '"1.2"'::jsonb, 'Summit Publisher Protocol version'),
  ('default_retry_limit', '5'::jsonb, 'Default max retries before dead-letter'),
  ('dead_letter_enabled', 'true'::jsonb, 'Whether dead-letter processing is enabled')
ON CONFLICT (key) DO NOTHING;

-- RLS
ALTER TABLE summit_config ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'summit_config' AND policyname = 'service_role full access'
  ) THEN
    CREATE POLICY "service_role full access"
      ON summit_config FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'summit_config' AND policyname = 'authenticated read only'
  ) THEN
    CREATE POLICY "authenticated read only"
      ON summit_config FOR SELECT TO authenticated
      USING (true);
  END IF;
END $$;

-- ============================================================================
-- 4. event_catalog table (registered event types)
-- ============================================================================
CREATE TABLE IF NOT EXISTS event_catalog (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      TEXT        NOT NULL UNIQUE,
  description     TEXT,
  schema_version  INT         NOT NULL DEFAULT 1,
  payload_schema  JSONB,
  category        TEXT,
  is_internal     BOOLEAN     NOT NULL DEFAULT false,
  payload_notes   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update updated_at
DROP TRIGGER IF EXISTS trg_event_catalog_updated_at ON event_catalog;
CREATE TRIGGER trg_event_catalog_updated_at
  BEFORE UPDATE ON event_catalog
  FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- RLS
ALTER TABLE event_catalog ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'event_catalog' AND policyname = 'service_role full access'
  ) THEN
    CREATE POLICY "service_role full access"
      ON event_catalog FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'event_catalog' AND policyname = 'authenticated read only'
  ) THEN
    CREATE POLICY "authenticated read only"
      ON event_catalog FOR SELECT TO authenticated
      USING (true);
  END IF;
END $$;

-- ============================================================================
-- 5. Expand events_outbox status CHECK + attach immutability trigger
-- ============================================================================
-- Expand status CHECK to accept protocol aliases
ALTER TABLE events_outbox DROP CONSTRAINT IF EXISTS events_outbox_status_check;
ALTER TABLE events_outbox ADD CONSTRAINT events_outbox_status_check
  CHECK (status IN ('pending', 'leased', 'dispatched', 'failed', 'processing', 'published', 'dead'));

-- Attach immutability trigger (idempotent via DROP IF EXISTS)
DROP TRIGGER IF EXISTS trg_events_outbox_immutable ON events_outbox;
CREATE TRIGGER trg_events_outbox_immutable
  BEFORE UPDATE ON events_outbox
  FOR EACH ROW EXECUTE FUNCTION fn_prevent_event_modification();

-- Composite index for dead-letter queries
CREATE INDEX IF NOT EXISTS idx_events_outbox_dead_letter
  ON events_outbox (status, tenant_id)
  WHERE status IN ('failed', 'dead');

-- summit_bot full access policy on events_outbox (fallback if BYPASSRLS not granted)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'events_outbox' AND policyname = 'summit_bot full access'
  ) THEN
    CREATE POLICY "summit_bot full access"
      ON events_outbox FOR ALL TO summit_bot
      USING (true) WITH CHECK (true);
  END IF;
EXCEPTION
  WHEN undefined_object THEN
    -- summit_bot role doesn't exist yet, skip
    NULL;
END $$;

-- ============================================================================
-- 6. events_dead_letter table
-- ============================================================================
CREATE TABLE IF NOT EXISTS events_dead_letter (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  original_event_id UUID,
  event_type        TEXT        NOT NULL,
  tenant_id         TEXT        NOT NULL,
  payload           JSONB       NOT NULL DEFAULT '{}'::jsonb,
  actor             JSONB       NOT NULL DEFAULT '{}'::jsonb,
  correlation_id    TEXT,
  error             TEXT,
  attempts          INT         NOT NULL DEFAULT 0,
  original_created_at TIMESTAMPTZ,
  dead_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_dead_letter_tenant
  ON events_dead_letter (tenant_id);

CREATE INDEX IF NOT EXISTS idx_events_dead_letter_event_type
  ON events_dead_letter (event_type);

CREATE INDEX IF NOT EXISTS idx_events_dead_letter_dead_at
  ON events_dead_letter (dead_at);

-- RLS
ALTER TABLE events_dead_letter ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'events_dead_letter' AND policyname = 'service_role full access'
  ) THEN
    CREATE POLICY "service_role full access"
      ON events_dead_letter FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'events_dead_letter' AND policyname = 'authenticated read own tenant'
  ) THEN
    CREATE POLICY "authenticated read own tenant"
      ON events_dead_letter FOR SELECT TO authenticated
      USING (
        tenant_id = coalesce(
          current_setting('app.current_tenant_id', true),
          ''
        )
      );
  END IF;
END $$;

-- summit_bot full access on protocol tables
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'events_dead_letter' AND policyname = 'summit_bot full access'
  ) THEN
    CREATE POLICY "summit_bot full access"
      ON events_dead_letter FOR ALL TO summit_bot
      USING (true) WITH CHECK (true);
  END IF;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'summit_config' AND policyname = 'summit_bot full access'
  ) THEN
    CREATE POLICY "summit_bot full access"
      ON summit_config FOR ALL TO summit_bot
      USING (true) WITH CHECK (true);
  END IF;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'event_catalog' AND policyname = 'summit_bot full access'
  ) THEN
    CREATE POLICY "summit_bot full access"
      ON event_catalog FOR ALL TO summit_bot
      USING (true) WITH CHECK (true);
  END IF;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- ============================================================================
-- 7. RPC functions
-- ============================================================================

-- register_event: upsert into event_catalog
CREATE OR REPLACE FUNCTION register_event(
  p_event_type     TEXT,
  p_description    TEXT        DEFAULT NULL,
  p_payload_schema JSONB       DEFAULT NULL,
  p_schema_version INT         DEFAULT 1,
  p_category       TEXT        DEFAULT NULL,
  p_is_internal    BOOLEAN     DEFAULT false,
  p_payload_notes  TEXT        DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO event_catalog (event_type, description, payload_schema, schema_version, category, is_internal, payload_notes)
  VALUES (p_event_type, p_description, p_payload_schema, p_schema_version, p_category, p_is_internal, p_payload_notes)
  ON CONFLICT (event_type) DO UPDATE SET
    description    = COALESCE(EXCLUDED.description, event_catalog.description),
    payload_schema = COALESCE(EXCLUDED.payload_schema, event_catalog.payload_schema),
    schema_version = EXCLUDED.schema_version,
    category       = COALESCE(EXCLUDED.category, event_catalog.category),
    is_internal    = EXCLUDED.is_internal,
    payload_notes  = COALESCE(EXCLUDED.payload_notes, event_catalog.payload_notes)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- emit_event: thin SQL wrapper to insert into events_outbox
CREATE OR REPLACE FUNCTION emit_event(
  p_type            TEXT,
  p_tenant_id       TEXT,
  p_payload         JSONB       DEFAULT '{}'::jsonb,
  p_actor           JSONB       DEFAULT '{}'::jsonb,
  p_correlation_id  TEXT        DEFAULT NULL,
  p_idempotency_key TEXT        DEFAULT NULL,
  p_version         INT         DEFAULT 1
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO events_outbox (type, tenant_id, payload, actor, correlation_id, idempotency_key, version)
  VALUES (p_type, p_tenant_id, p_payload, p_actor, p_correlation_id, p_idempotency_key, p_version)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- update_event_catalog_item: update a catalog entry by event_type
CREATE OR REPLACE FUNCTION update_event_catalog_item(
  p_event_type     TEXT,
  p_description    TEXT        DEFAULT NULL,
  p_payload_schema JSONB       DEFAULT NULL,
  p_schema_version INT         DEFAULT NULL,
  p_category       TEXT        DEFAULT NULL,
  p_is_internal    BOOLEAN     DEFAULT NULL,
  p_payload_notes  TEXT        DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE event_catalog SET
    description    = COALESCE(p_description, description),
    payload_schema = COALESCE(p_payload_schema, payload_schema),
    schema_version = COALESCE(p_schema_version, schema_version),
    category       = COALESCE(p_category, category),
    is_internal    = COALESCE(p_is_internal, is_internal),
    payload_notes  = COALESCE(p_payload_notes, payload_notes)
  WHERE event_type = p_event_type;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event type "%" not found in catalog', p_event_type;
  END IF;
END;
$$;

-- move_to_dead_letter: move a failed event to events_dead_letter
CREATE OR REPLACE FUNCTION move_to_dead_letter(p_event_id UUID)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_event events_outbox%ROWTYPE;
  v_dead_id UUID;
BEGIN
  SELECT * INTO v_event FROM events_outbox WHERE id = p_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event "%" not found in outbox', p_event_id;
  END IF;

  IF v_event.status NOT IN ('failed', 'dead') THEN
    RAISE EXCEPTION 'Event "%" has status "%" — only failed/dead events can be moved to dead letter', p_event_id, v_event.status;
  END IF;

  INSERT INTO events_dead_letter (
    original_event_id, event_type, tenant_id, payload, actor,
    correlation_id, error, attempts, original_created_at
  ) VALUES (
    v_event.id, v_event.type, v_event.tenant_id, v_event.payload, v_event.actor,
    v_event.correlation_id, v_event.dispatch_error, v_event.retry_count, v_event.created_at
  )
  RETURNING id INTO v_dead_id;

  DELETE FROM events_outbox WHERE id = p_event_id;

  RETURN v_dead_id;
END;
$$;
