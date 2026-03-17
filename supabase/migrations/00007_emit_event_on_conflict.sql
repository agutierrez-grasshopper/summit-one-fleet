-- @summit/chassis - Migration 00007: emit_event ON CONFLICT handling
--
-- Replaces the emit_event() RPC function to use ON CONFLICT (idempotency_key)
-- DO NOTHING when an idempotency_key is provided and already exists.
--
-- Returns NULL UUID when a duplicate idempotency_key is detected.
-- Returns the new row UUID on successful insert.
--
-- Depends on: 00004 (original emit_event), 00006 (partial unique index)
-- This migration is idempotent (safe to run multiple times).

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
  ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_id;

  -- v_id is NULL when ON CONFLICT triggered (duplicate idempotency_key)
  RETURN v_id;
END;
$$;

-- Bump schema version
UPDATE summit_config
SET value = '"6"'::jsonb
WHERE key = 'chassis_schema_version';

INSERT INTO summit_config (key, value, description)
VALUES ('chassis_schema_version', '"6"'::jsonb, 'Chassis DB schema version')
ON CONFLICT (key) DO UPDATE SET value = '"6"'::jsonb;
