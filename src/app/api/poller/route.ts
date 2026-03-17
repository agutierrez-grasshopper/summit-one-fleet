import { createReadRoute, createWriteRoute } from '@rocketmanv9/chassis/nextjs';
import { AppError } from '@rocketmanv9/chassis/errors';
import { createTenantServiceClient } from '@rocketmanv9/chassis/supabase';

const SERVICE_NAME = process.env.INTERNAL_JWT_ISSUER || 'summit-one-fleet';
const EVENT_POLLER_SECRET = process.env.EVENT_POLLER_SECRET;

/**
 * GET /api/poller — health check for the event poller.
 */
export const GET = createReadRoute(async ({ log }) => {
  log.info('poller.health');
  return Response.json({
    status: 'ok',
    service: SERVICE_NAME,
    timestamp: new Date().toISOString(),
  });
}, { serviceName: SERVICE_NAME, auth: 'public' });

/**
 * POST /api/poller — trigger an event poll cycle.
 *
 * Protected by EVENT_POLLER_SECRET. Called by pg_cron or external scheduler.
 * This is an alternative to the Supabase Edge Function event-poller —
 * use one or the other, not both.
 */
export const POST = createWriteRoute(async ({ req, log }) => {
  // Verify poller secret
  if (EVENT_POLLER_SECRET) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${EVENT_POLLER_SECRET}`) {
      throw AppError.unauthorized('Invalid poller secret');
    }
  }

  const supabase = createTenantServiceClient({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    tenantId: 'system',
  });

  // Claim a batch of pending events
  const pollerId = `api-poller-${SERVICE_NAME}`;
  const { data: events, error: claimError } = await supabase.rpc('outbox_claim_batch', {
    p_batch_size: 50,
    p_poller_id: pollerId,
    p_lease_seconds: 60,
  });

  if (claimError) {
    log.error('poller.claim_failed', { error: claimError.message });
    throw AppError.internal(`Claim failed: ${claimError.message}`);
  }

  if (!events?.length) {
    return {
      data: { status: 'ok', claimed: 0, delivered: 0, failed: 0 },
      status: 200,
      events: [],
    };
  }

  log.info('poller.claimed', { count: events.length });

  // Deliver events to Hub or webhook subscribers
  const delivered: string[] = [];
  const failed: { id: string; error: string }[] = [];

  const hubUrl = process.env.HUB_WEBHOOK_URL;

  if (hubUrl) {
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
          occurred_at: event.created_at,
        });

        const response = await fetch(hubUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });

        if (response.ok) {
          delivered.push(event.id);
        } else {
          const errorText = await response.text().catch(() => 'Unknown');
          failed.push({ id: event.id, error: `HTTP ${response.status}: ${errorText.slice(0, 200)}` });
        }
      } catch (err) {
        failed.push({ id: event.id, error: err instanceof Error ? err.message : 'Unknown' });
      }
    }
  } else {
    // No Hub — mark all as delivered (events stay in outbox for local consumers)
    for (const event of events) {
      delivered.push(event.id);
    }
  }

  // Mark results
  if (delivered.length > 0) {
    await supabase.rpc('outbox_mark_dispatched', { p_event_ids: delivered });
  }

  for (const fail of failed) {
    await supabase.rpc('outbox_mark_failed', { p_event_id: fail.id, p_error: fail.error });
  }

  const result = {
    status: 'ok',
    poller_id: pollerId,
    claimed: events.length,
    delivered: delivered.length,
    failed: failed.length,
  };

  log.info('poller.complete', result);

  return {
    data: result,
    status: 200,
    events: [],
  };
}, { serviceName: SERVICE_NAME, auth: 'public', scope: 'POST /api/poller' });
