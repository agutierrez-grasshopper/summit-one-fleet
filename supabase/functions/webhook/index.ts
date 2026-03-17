// supabase/functions/webhook/index.ts
//
// Edge Function: Inbound Webhook Receiver
//
// Receives events FROM Summit Core/Hub. Verifies HMAC signature
// (x-webhook-signature), checks for idempotency via hub_inbox_try_insert(),
// and routes to event handlers based on event_type.
//
// This is the consumer-side counterpart to the event-poller (publisher-side).
//
// Usage:
//   POST /functions/v1/webhook
//   Headers: x-webhook-signature: <HMAC-SHA256 hex>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WEBHOOK_SIGNING_SECRET = Deno.env.get('WEBHOOK_SIGNING_SECRET')!;

interface InboundEvent {
  id: string;
  type: string;
  tenant_id: string;
  payload: Record<string, unknown>;
  actor?: Record<string, unknown>;
  correlation_id?: string;
  causation_id?: string;
  trace_id?: string;
  version?: number;
  occurred_at?: string;
}

/**
 * Verify HMAC-SHA256 signature.
 */
async function verifySignature(secret: string, payload: string, signature: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const expected = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const expectedHex = Array.from(new Uint8Array(expected))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Constant-time comparison
  if (expectedHex.length !== signature.length) return false;
  let result = 0;
  for (let i = 0; i < expectedHex.length; i++) {
    result |= expectedHex.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Route events to handlers based on event_type.
 */
async function handleEvent(
  supabase: ReturnType<typeof createClient>,
  event: InboundEvent,
): Promise<void> {
  const { type, payload, tenant_id } = event;

  switch (type) {
    // Core user/tenant sync events
    case 'tenant.membership.created':
    case 'tenant.membership.updated': {
      const { user_id, role, email, name } = payload as Record<string, string>;
      await supabase.from('local_users').upsert({
        user_id,
        tenant_id,
        email,
        name,
        role,
        synced_at: new Date().toISOString(),
      });
      break;
    }

    case 'profile.updated': {
      const { user_id, first_name, last_name, email } = payload as Record<string, string>;
      await supabase
        .from('local_users')
        .update({
          email,
          name: [first_name, last_name].filter(Boolean).join(' '),
          synced_at: new Date().toISOString(),
        })
        .eq('user_id', user_id)
        .eq('tenant_id', tenant_id);
      break;
    }

    case 'tenant.updated': {
      // Sync tenant metadata to fleet_tenants
      const { tenant_id: tid, name, slug, status } = payload as Record<string, string>;
      await supabase.from('fleet_tenants').upsert({
        id: tid || tenant_id,
        tenant_id: tid || tenant_id,
        name,
        slug,
        status: status || 'active',
        synced_at: new Date().toISOString(),
      });
      break;
    }

    default:
      console.log(`Unhandled event type: ${type}`);
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 1. Read body and verify HMAC signature
  const rawBody = await req.text();
  const signature = req.headers.get('x-webhook-signature');

  if (!signature) {
    return new Response(JSON.stringify({ error: 'Missing webhook signature' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const valid = await verifySignature(WEBHOOK_SIGNING_SECRET, rawBody, signature);
  if (!valid) {
    return new Response(JSON.stringify({ error: 'Invalid webhook signature' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 2. Parse the event
  let event: InboundEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!event.id || !event.type || !event.tenant_id) {
    return new Response(JSON.stringify({ error: 'Missing required fields: id, type, tenant_id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // 3. Idempotency check via hub_inbox_try_insert
    const { data: insertResult, error: insertError } = await supabase.rpc('hub_inbox_try_insert', {
      p_hub_event_id: event.id,
      p_tenant_id: event.tenant_id,
      p_event_type: event.type,
      p_event_version: event.version || 1,
      p_correlation_id: event.correlation_id || null,
      p_causation_id: event.causation_id || null,
      p_trace_id: event.trace_id || null,
      p_payload: event.payload,
    });

    if (insertError) {
      console.error('hub_inbox_try_insert failed:', insertError);
      return new Response(JSON.stringify({ error: 'Inbox insert failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const row = Array.isArray(insertResult) ? insertResult[0] : insertResult;
    if (!row?.inserted) {
      // Already processed — idempotent success
      return new Response(JSON.stringify({ status: 'already_processed', inbox_id: row?.inbox_id }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 4. Route to handler
    await handleEvent(supabase, event);

    // 5. Mark as processed
    if (row?.inbox_id) {
      await supabase
        .from('hub_event_inbox')
        .update({
          status: 'processed',
          processed_at: new Date().toISOString(),
        })
        .eq('id', row.inbox_id);
    }

    return new Response(
      JSON.stringify({ status: 'processed', inbox_id: row?.inbox_id }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('Webhook processing error:', err);
    return new Response(
      JSON.stringify({ error: 'Processing failed', detail: err instanceof Error ? err.message : 'Unknown' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});
