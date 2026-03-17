// supabase/functions/event-poller/index.ts
//
// Edge Function: Event Poller
//
// Polls events_outbox for pending events and delivers them to the Hub
// or webhook subscribers. Uses outbox_claim_batch() → deliver →
// outbox_mark_dispatched() / outbox_mark_failed().
//
// Protected by EVENT_POLLER_SECRET. Trigger via pg_cron every 60 seconds.
//
// Usage:
//   POST /functions/v1/event-poller  (with Authorization: Bearer <EVENT_POLLER_SECRET>)
//   GET  /functions/v1/event-poller  (health check)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EVENT_POLLER_SECRET = Deno.env.get('EVENT_POLLER_SECRET');
const HUB_WEBHOOK_URL = Deno.env.get('HUB_WEBHOOK_URL');
const HUB_WEBHOOK_SECRET = Deno.env.get('HUB_WEBHOOK_SECRET');
const POLLER_BATCH_SIZE = parseInt(Deno.env.get('POLLER_BATCH_SIZE') || '50', 10);
const POLLER_LEASE_SECONDS = parseInt(Deno.env.get('POLLER_LEASE_SECONDS') || '60', 10);
const POLLER_ID = Deno.env.get('POLLER_ID') || `edge-poller-${crypto.randomUUID().slice(0, 8)}`;

interface OutboxEvent {
  id: string;
  type: string;
  event_type: string;
  tenant_id: string;
  payload: Record<string, unknown>;
  actor: Record<string, unknown>;
  correlation_id: string | null;
  idempotency_key: string | null;
  version: number;
  trace_id: string | null;
  created_at: string;
}

/**
 * Sign a payload with HMAC-SHA256 for webhook delivery.
 */
async function hmacSign(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Deliver a batch of events to the Hub webhook endpoint.
 */
async function deliverToHub(events: OutboxEvent[]): Promise<{ delivered: string[]; failed: { id: string; error: string }[] }> {
  const delivered: string[] = [];
  const failed: { id: string; error: string }[] = [];

  if (!HUB_WEBHOOK_URL) {
    // No Hub configured — try webhook subscribers instead
    return { delivered, failed };
  }

  for (const event of events) {
    try {
      const body = JSON.stringify({
        id: event.id,
        type: event.type || event.event_type,
        tenant_id: event.tenant_id,
        payload: event.payload,
        actor: event.actor,
        correlation_id: event.correlation_id,
        version: event.version,
        trace_id: event.trace_id,
        occurred_at: event.created_at,
      });

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (HUB_WEBHOOK_SECRET) {
        headers['x-webhook-signature'] = await hmacSign(HUB_WEBHOOK_SECRET, body);
      }

      const response = await fetch(HUB_WEBHOOK_URL, {
        method: 'POST',
        headers,
        body,
      });

      if (response.ok) {
        delivered.push(event.id);
      } else {
        const errorText = await response.text().catch(() => 'Unknown error');
        failed.push({ id: event.id, error: `HTTP ${response.status}: ${errorText.slice(0, 200)}` });
      }
    } catch (err) {
      failed.push({ id: event.id, error: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  return { delivered, failed };
}

/**
 * Deliver events to tenant webhook subscribers.
 */
async function deliverToWebhookSubscribers(
  supabase: ReturnType<typeof createClient>,
  events: OutboxEvent[],
): Promise<{ delivered: string[]; failed: { id: string; error: string }[] }> {
  const delivered: string[] = [];
  const failed: { id: string; error: string }[] = [];

  // Group events by tenant for efficient subscriber lookup
  const byTenant = new Map<string, OutboxEvent[]>();
  for (const event of events) {
    const list = byTenant.get(event.tenant_id) || [];
    list.push(event);
    byTenant.set(event.tenant_id, list);
  }

  for (const [tenantId, tenantEvents] of byTenant) {
    // Fetch active webhook subscriptions for this tenant
    const { data: subscriptions } = await supabase
      .from('webhook_subscriptions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('active', true);

    if (!subscriptions?.length) {
      // No subscribers — mark as delivered (no-one to send to)
      for (const event of tenantEvents) {
        delivered.push(event.id);
      }
      continue;
    }

    for (const event of tenantEvents) {
      let eventDelivered = false;

      for (const sub of subscriptions) {
        // Check if subscription matches this event type
        const matches =
          sub.event_type === event.type ||
          sub.event_type === '*' ||
          (sub.event_type.endsWith('.*') && event.type.startsWith(sub.event_type.slice(0, -1)));

        if (!matches) continue;

        try {
          const body = JSON.stringify({
            id: event.id,
            type: event.type,
            tenant_id: event.tenant_id,
            payload: event.payload,
            occurred_at: event.created_at,
          });

          const signature = await hmacSign(sub.secret, body);

          const response = await fetch(sub.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-webhook-signature': signature,
            },
            body,
          });

          if (response.ok) {
            eventDelivered = true;
          }
        } catch {
          // Individual subscriber failure doesn't fail the event
        }
      }

      if (eventDelivered) {
        delivered.push(event.id);
      } else {
        failed.push({ id: event.id, error: 'No subscriber accepted delivery' });
      }
    }
  }

  return { delivered, failed };
}

Deno.serve(async (req) => {
  // Health check
  if (req.method === 'GET') {
    return new Response(JSON.stringify({ status: 'ok', poller_id: POLLER_ID }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Verify poller secret
  if (EVENT_POLLER_SECRET) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${EVENT_POLLER_SECRET}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // 1. Claim a batch of pending events
    const { data: events, error: claimError } = await supabase.rpc('outbox_claim_batch', {
      p_batch_size: POLLER_BATCH_SIZE,
      p_poller_id: POLLER_ID,
      p_lease_seconds: POLLER_LEASE_SECONDS,
    });

    if (claimError) {
      console.error('outbox_claim_batch failed:', claimError);
      return new Response(JSON.stringify({ error: 'Claim failed', detail: claimError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!events?.length) {
      return new Response(JSON.stringify({ status: 'ok', claimed: 0, delivered: 0, failed: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log(`Claimed ${events.length} events`);

    // 2. Deliver to Hub (primary) or webhook subscribers (fallback)
    let delivered: string[] = [];
    let failed: { id: string; error: string }[] = [];

    if (HUB_WEBHOOK_URL) {
      const hubResult = await deliverToHub(events);
      delivered = hubResult.delivered;
      failed = hubResult.failed;
    } else {
      const webhookResult = await deliverToWebhookSubscribers(supabase, events);
      delivered = webhookResult.delivered;
      failed = webhookResult.failed;
    }

    // 3. Mark delivered events as dispatched
    if (delivered.length > 0) {
      const { error: dispatchError } = await supabase.rpc('outbox_mark_dispatched', {
        p_event_ids: delivered,
      });
      if (dispatchError) {
        console.error('outbox_mark_dispatched failed:', dispatchError);
      }
    }

    // 4. Mark failed events (triggers exponential backoff / dead-letter)
    for (const fail of failed) {
      const { error: failError } = await supabase.rpc('outbox_mark_failed', {
        p_event_id: fail.id,
        p_error: fail.error,
      });
      if (failError) {
        console.error(`outbox_mark_failed failed for ${fail.id}:`, failError);
      }
    }

    const result = {
      status: 'ok',
      poller_id: POLLER_ID,
      claimed: events.length,
      delivered: delivered.length,
      failed: failed.length,
    };

    console.log('Poll cycle complete:', result);

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Poller error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal error', detail: err instanceof Error ? err.message : 'Unknown' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});
