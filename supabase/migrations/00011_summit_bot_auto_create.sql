-- @summit/chassis - Migration 00011: Auto-Create summit_bot Role
--
-- Creates the summit_bot Postgres role automatically so the Command Center's
-- core-proxy Edge Function can connect and read event data.
--
-- Password is read from the Supabase vault secret 'summit_bot_password'.
-- If the secret doesn't exist, falls back to a generated password stored
-- in summit_config for retrieval.
--
-- This migration is idempotent (safe to run multiple times).

-- ============================================================================
-- 0. Ensure pgcrypto extension (needed for gen_random_bytes)
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 1. Create summit_bot role with password
-- ============================================================================
-- Uses a DO block to handle the role creation idempotently.
-- Password source priority:
--   1. Supabase vault secret 'summit_bot_password' (if vault extension available)
--   2. Auto-generated and stored in summit_config for later retrieval
DO $$
DECLARE
  v_password TEXT;
  v_has_vault BOOLEAN := false;
BEGIN
  -- Check if summit_bot already exists
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'summit_bot') THEN
    RAISE NOTICE 'summit_bot role already exists — skipping creation';
    RETURN;
  END IF;

  -- Try to read password from Supabase vault
  BEGIN
    SELECT EXISTS (
      SELECT 1 FROM pg_extension WHERE extname = 'supabase_vault'
    ) INTO v_has_vault;
  EXCEPTION WHEN OTHERS THEN
    v_has_vault := false;
  END;

  IF v_has_vault THEN
    BEGIN
      SELECT decrypted_secret INTO v_password
      FROM vault.decrypted_secrets
      WHERE name = 'summit_bot_password'
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      v_password := NULL;
    END;
  END IF;

  -- Fallback: generate a secure random password
  IF v_password IS NULL OR v_password = '' THEN
    v_password := encode(gen_random_bytes(32), 'base64');
    -- Store the generated password in summit_config for retrieval
    INSERT INTO summit_config (key, value, description) VALUES
      ('summit_bot_password', to_jsonb(v_password), 'Auto-generated summit_bot password. Retrieve with: SELECT value FROM summit_config WHERE key = ''summit_bot_password''')
    ON CONFLICT (key) DO NOTHING;

    RAISE NOTICE 'summit_bot password auto-generated. Retrieve it with:';
    RAISE NOTICE '  SELECT value FROM summit_config WHERE key = ''summit_bot_password'';';
  END IF;

  -- Create the role
  EXECUTE format('CREATE ROLE summit_bot WITH LOGIN PASSWORD %L', v_password);

  RAISE NOTICE 'summit_bot role created successfully';
END $$;

-- ============================================================================
-- 2. Grant permissions (idempotent — safe if role already had them)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'summit_bot') THEN
    RAISE NOTICE 'summit_bot role does not exist — skipping grants';
    RETURN;
  END IF;

  -- Connect permission
  EXECUTE 'GRANT CONNECT ON DATABASE postgres TO summit_bot';

  -- Schema usage
  EXECUTE 'GRANT USAGE ON SCHEMA public TO summit_bot';

  -- Table access (all protocol tables)
  EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON events_outbox, event_catalog, summit_config, events_dead_letter TO summit_bot';

  -- Inbox tables (may not exist in older installations)
  BEGIN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON hub_event_inbox, consumer_event_receipts TO summit_bot';
  EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'hub_event_inbox / consumer_event_receipts not found — skipping grants';
  END;

  -- Sequence access
  EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO summit_bot';

  -- Function execution
  EXECUTE 'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO summit_bot';

  -- Try BYPASSRLS (requires superuser privilege)
  BEGIN
    EXECUTE 'ALTER ROLE summit_bot BYPASSRLS';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Could not grant BYPASSRLS to summit_bot — RLS policies will be used instead';
  END;

  RAISE NOTICE 'summit_bot permissions granted';
END $$;

-- ============================================================================
-- 3. Bump schema version
-- ============================================================================
INSERT INTO summit_config (key, value, description) VALUES
  ('chassis_schema_version', '11'::jsonb, 'Chassis DB schema version — checked by assertChassisSchemaVersion()')
ON CONFLICT (key) DO UPDATE SET value = '11'::jsonb;
