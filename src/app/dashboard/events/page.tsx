import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import { createTenantServiceClient } from '@rocketmanv9/chassis/supabase';

function formatTimestamp(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function timeSince(d: string) {
  const seconds = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

const statusBadge: Record<string, string> = {
  pending: 'badge-yellow',
  processing: 'badge-blue',
  published: 'badge-green',
  dispatched: 'badge-green',
  failed: 'badge-red',
  dead: 'badge-red',
  received: 'badge-blue',
  processed: 'badge-green',
};

export default async function EventsPage() {
  const session = await getSession();
  if (!session) redirect(process.env.NEXT_PUBLIC_CORE_APP_URL || '/');

  // Developer gate — same pattern as Core's catalog admin
  const isDeveloper = session.isDeveloper || session.role === 'admin';
  if (!isDeveloper) redirect('/dashboard');

  const tenantId = session.tenantId || '__none__';

  const supabase = await createTenantServiceClient({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    tenantId,
  });

  // Fetch all event pipeline data in parallel
  const [outbox, deadLetter, inbox, outboxCounts] = await Promise.all([
    supabase
      .from('events_outbox')
      .select('id, type, event_type, status, tenant_id, correlation_id, trace_id, retry_count, attempt_count, dispatch_error, created_at, dispatched_at, published_at')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(r => r.data || []),
    supabase
      .from('events_dead_letter')
      .select('id, event_type, tenant_id, error, attempts, original_created_at, dead_at, trace_id')
      .order('dead_at', { ascending: false })
      .limit(20)
      .then(r => r.data || []),
    supabase
      .from('hub_event_inbox')
      .select('id, hub_event_id, event_type, status, tenant_id, attempts, error_message, received_at, processed_at')
      .order('received_at', { ascending: false })
      .limit(30)
      .then(r => r.data || []),
    // Counts by status
    Promise.all([
      supabase.from('events_outbox').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('events_outbox').select('*', { count: 'exact', head: true }).eq('status', 'published'),
      supabase.from('events_outbox').select('*', { count: 'exact', head: true }).eq('status', 'failed'),
      supabase.from('events_outbox').select('*', { count: 'exact', head: true }),
      supabase.from('events_dead_letter').select('*', { count: 'exact', head: true }),
      supabase.from('hub_event_inbox').select('*', { count: 'exact', head: true }),
    ]).then(([pending, published, failed, total, dead, inboxTotal]) => ({
      pending: pending.count ?? 0,
      published: published.count ?? 0,
      failed: failed.count ?? 0,
      total: total.count ?? 0,
      deadLetter: dead.count ?? 0,
      inbox: inboxTotal.count ?? 0,
    })),
  ]);

  return (
    <div>
      {/* Header with dev badge */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Event Pipeline</h1>
          <p>Outbox, dead-letter queue, and inbound events</p>
        </div>
        <span className="badge badge-purple" style={{ fontSize: '0.625rem', letterSpacing: '0.05em' }}>
          DEV TOOLS
        </span>
      </div>

      {/* Status counters */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <CountCard label="Total Outbox" count={outboxCounts.total} color="var(--text-muted)" />
        <CountCard label="Pending" count={outboxCounts.pending} color="var(--yellow)" />
        <CountCard label="Published" count={outboxCounts.published} color="var(--green)" />
        <CountCard label="Failed" count={outboxCounts.failed} color="var(--red)" />
        <CountCard label="Dead Letter" count={outboxCounts.deadLetter} color="var(--red)" />
        <CountCard label="Inbox" count={outboxCounts.inbox} color="var(--cyan)" />
      </div>

      {/* Outbox table */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 0.75rem' }}>
          Events Outbox
        </h2>
        {outbox.length === 0 ? (
          <div className="panel empty-state"><p>No outbox events</p></div>
        ) : (
          <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Retries</th>
                  <th>Error</th>
                  <th>Trace</th>
                  <th>Created</th>
                  <th>Published</th>
                </tr>
              </thead>
              <tbody>
                {outbox.map((e: any) => (
                  <tr key={e.id}>
                    <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                      <span className="mono" style={{ fontSize: '0.6875rem' }}>{e.type || e.event_type}</span>
                    </td>
                    <td>
                      <span className={`badge ${statusBadge[e.status] || 'badge-gray'}`}>{e.status}</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {(e.retry_count || e.attempt_count || 0) > 0 ? (
                        <span style={{ color: 'var(--yellow)' }}>{e.retry_count || e.attempt_count}</span>
                      ) : '—'}
                    </td>
                    <td>
                      {e.dispatch_error ? (
                        <span style={{ color: 'var(--red)', fontSize: '0.6875rem' }} title={e.dispatch_error}>
                          {e.dispatch_error.slice(0, 40)}{e.dispatch_error.length > 40 ? '...' : ''}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="mono" style={{ fontSize: '0.625rem', color: 'var(--text-muted)' }}>
                      {e.trace_id ? e.trace_id.slice(0, 8) + '...' : '—'}
                    </td>
                    <td title={formatTimestamp(e.created_at)}>
                      {e.created_at ? timeSince(e.created_at) : '—'}
                    </td>
                    <td>
                      {e.published_at || e.dispatched_at
                        ? formatTimestamp(e.published_at || e.dispatched_at)
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dead letter + Inbox side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        {/* Dead Letter */}
        <div>
          <h2 style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 0.75rem' }}>
            Dead Letter Queue
          </h2>
          {deadLetter.length === 0 ? (
            <div className="panel empty-state"><p>No dead letters</p></div>
          ) : (
            <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Event Type</th>
                    <th>Attempts</th>
                    <th>Error</th>
                    <th>Dead At</th>
                  </tr>
                </thead>
                <tbody>
                  {deadLetter.map((e: any) => (
                    <tr key={e.id}>
                      <td className="mono" style={{ fontSize: '0.6875rem', color: 'var(--text-primary)' }}>{e.event_type}</td>
                      <td style={{ textAlign: 'center', color: 'var(--red)' }}>{e.attempts}</td>
                      <td style={{ fontSize: '0.6875rem', color: 'var(--red)' }} title={e.error}>
                        {e.error ? e.error.slice(0, 30) + (e.error.length > 30 ? '...' : '') : '—'}
                      </td>
                      <td>{e.dead_at ? timeSince(e.dead_at) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Hub Inbox */}
        <div>
          <h2 style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 0.75rem' }}>
            Hub Event Inbox
          </h2>
          {inbox.length === 0 ? (
            <div className="panel empty-state"><p>No inbound events</p></div>
          ) : (
            <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Event Type</th>
                    <th>Status</th>
                    <th>Attempts</th>
                    <th>Received</th>
                  </tr>
                </thead>
                <tbody>
                  {inbox.map((e: any) => (
                    <tr key={e.id}>
                      <td className="mono" style={{ fontSize: '0.6875rem', color: 'var(--text-primary)' }}>{e.event_type}</td>
                      <td><span className={`badge ${statusBadge[e.status] || 'badge-gray'}`}>{e.status}</span></td>
                      <td style={{ textAlign: 'center' }}>{e.attempts || 0}</td>
                      <td>{e.received_at ? timeSince(e.received_at) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CountCard({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="stat-card" style={{ textAlign: 'center' }}>
      <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color }}>{count}</p>
      <p style={{ margin: '0.25rem 0 0', fontSize: '0.6875rem', color: 'var(--text-muted)' }}>{label}</p>
    </div>
  );
}
