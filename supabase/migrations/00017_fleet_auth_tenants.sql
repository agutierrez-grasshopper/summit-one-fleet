-- @summit/chassis - Migration 00017: Fleet Auth & Tenant Tables
--
-- Creates: sso_tokens, fleet_tenants
-- SSO tokens enable cross-project authentication with Summit One Core.
-- Fleet tenants store locally-synced tenant metadata.
--
-- This migration is idempotent (safe to run multiple times).

-- ============================================================================
-- 1. sso_tokens — Short-lived tokens for cross-project SSO
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sso_tokens (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  token       TEXT NOT NULL UNIQUE,
  user_id     UUID NOT NULL,
  email       TEXT,
  tenant_id   UUID NOT NULL,
  role        TEXT NOT NULL DEFAULT 'authenticated',
  name        TEXT,
  expires_at  TIMESTAMPTZ NOT NULL,
  used        BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sso_tokens ENABLE ROW LEVEL SECURITY;

-- Index: fast lookup by token
CREATE INDEX IF NOT EXISTS idx_sso_tokens_token ON public.sso_tokens (token);

-- Index: cleanup query — find unexpired, unused tokens
CREATE INDEX IF NOT EXISTS idx_sso_tokens_expires_at_unused
  ON public.sso_tokens (expires_at) WHERE used = false;

-- Index: tenant scoping
CREATE INDEX IF NOT EXISTS idx_sso_tokens_tenant_id ON public.sso_tokens (tenant_id);

-- Service role: full access (tokens are server-side only)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'sso_tokens' AND policyname = 'sso_tokens_service_role_all'
  ) THEN
    CREATE POLICY sso_tokens_service_role_all ON public.sso_tokens
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Cleanup function: remove expired or used tokens
CREATE OR REPLACE FUNCTION cleanup_expired_sso_tokens()
RETURNS TABLE(deleted_count BIGINT) AS $$
DECLARE
  v_count BIGINT;
BEGIN
  DELETE FROM sso_tokens WHERE expires_at < now() OR used = true;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 2. fleet_tenants — Tenant metadata synced from Summit One Core
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.fleet_tenants (
  id          UUID PRIMARY KEY,                        -- Same UUID as Core tenant
  tenant_id   UUID NOT NULL UNIQUE,                    -- Same as id, for RLS policy consistency
  name        TEXT,
  slug        TEXT,
  status      TEXT NOT NULL DEFAULT 'active',
  settings    JSONB NOT NULL DEFAULT '{}'::jsonb,
  synced_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.fleet_tenants ENABLE ROW LEVEL SECURITY;

-- Index: tenant scoping
CREATE INDEX IF NOT EXISTS idx_fleet_tenants_tenant_id ON public.fleet_tenants (tenant_id);

-- Index: slug lookup (partial — only non-null slugs)
CREATE INDEX IF NOT EXISTS idx_fleet_tenants_slug ON public.fleet_tenants (slug) WHERE slug IS NOT NULL;

-- Index: status filtering
CREATE INDEX IF NOT EXISTS idx_fleet_tenants_status ON public.fleet_tenants (status);

-- Service role: full access
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'fleet_tenants' AND policyname = 'fleet_tenants_service_role_all'
  ) THEN
    CREATE POLICY fleet_tenants_service_role_all ON public.fleet_tenants
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Authenticated users: read own tenant only
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'fleet_tenants' AND policyname = 'authenticated read own tenant'
  ) THEN
    CREATE POLICY "authenticated read own tenant" ON public.fleet_tenants
      FOR SELECT TO authenticated
      USING (tenant_id = (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'tenant_id')::UUID);
  END IF;
END $$;

-- Trigger: auto-update updated_at on row changes (fn_update_timestamp from 00004)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'trg_fleet_tenants_updated_at'
      AND event_object_table = 'fleet_tenants'
  ) THEN
    CREATE TRIGGER trg_fleet_tenants_updated_at
      BEFORE UPDATE ON public.fleet_tenants
      FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
  END IF;
END $$;
