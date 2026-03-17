import { getSession } from '@/lib/session';
import { createTenantServiceClient } from '@rocketmanv9/chassis/supabase';
import Link from 'next/link';
import { redirect } from 'next/navigation';

async function safeCount(supabase: any, table: string): Promise<number> {
  try {
    const { count } = await supabase.from(table).select('*', { count: 'exact', head: true });
    return count ?? 0;
  } catch {
    return 0;
  }
}

async function getCounts(tenantId: string) {
  const supabase = await createTenantServiceClient({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    tenantId,
  });

  const [assets, inspections, workOrders, equipment, geofences, telemetry] = await Promise.all([
    safeCount(supabase, 'assets'),
    safeCount(supabase, 'inspections'),
    safeCount(supabase, 'work_orders'),
    safeCount(supabase, 'equipment'),
    safeCount(supabase, 'geofences'),
    safeCount(supabase, 'telemetry_data'),
  ]);

  return { assets, inspections, workOrders, equipment, geofences, telemetry };
}

async function getRecentActivity(tenantId: string) {
  try {
    const supabase = await createTenantServiceClient({
      url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      tenantId,
    });

    const { data } = await supabase
      .from('events_outbox')
      .select('id, type, status, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    return data || [];
  } catch {
    return [];
  }
}

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect(process.env.NEXT_PUBLIC_CORE_APP_URL || '/');

  const auth = {
    userId: session.userId,
    email: session.email,
    tenantId: session.tenantId || '__none__',
    name: session.name,
    role: session.role,
  };

  const [counts, recentEvents] = await Promise.all([
    getCounts(auth.tenantId),
    getRecentActivity(auth.tenantId),
  ]);

  const cards = [
    { label: 'Assets', count: counts.assets, href: '/dashboard/assets', color: 'var(--accent)' },
    { label: 'Inspections', count: counts.inspections, href: '/dashboard/inspections', color: 'var(--green)' },
    { label: 'Work Orders', count: counts.workOrders, href: '/dashboard/work-orders', color: 'var(--yellow)' },
    { label: 'Equipment', count: counts.equipment, href: '/dashboard/equipment', color: 'var(--purple)' },
    { label: 'Geofences', count: counts.geofences, href: '/dashboard/geofences', color: 'var(--pink)' },
    { label: 'Telemetry', count: counts.telemetry, href: '/dashboard/telemetry', color: 'var(--cyan)' },
  ];

  return (
    <div>
      <div className="page-header">
        <h1>Overview</h1>
        <p>Fleet management dashboard</p>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {cards.map((card) => (
          <Link key={card.label} href={card.href}>
            <div className="stat-card">
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>
                  {card.count}
                </span>
                <span style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: card.color,
                  display: 'inline-block',
                  flexShrink: 0,
                }} />
              </div>
              <p style={{ margin: '0.375rem 0 0', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                {card.label}
              </p>
            </div>
          </Link>
        ))}
      </div>

      {/* Bottom panels */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        {/* Session */}
        <div className="panel">
          <h2 style={{ fontSize: '0.8125rem', fontWeight: 600, margin: '0 0 1rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Session
          </h2>
          <div style={{ display: 'grid', gap: '0.625rem' }}>
            <Row label="User" value={auth.name || auth.email} />
            <Row label="Email" value={auth.email} />
            <Row label="Role" value={auth.role} />
            <Row label="User ID" value={auth.userId} mono />
            <Row label="Tenant" value={auth.tenantId} mono />
          </div>
        </div>

        {/* Recent Events */}
        <div className="panel">
          <h2 style={{ fontSize: '0.8125rem', fontWeight: 600, margin: '0 0 1rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Recent Events
          </h2>
          {recentEvents.length === 0 ? (
            <div className="empty-state">
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>No events yet</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {recentEvents.map((e: any) => {
                const badgeClass =
                  e.status === 'published' ? 'badge-green' :
                  e.status === 'pending' ? 'badge-yellow' :
                  e.status === 'failed' ? 'badge-red' : 'badge-gray';
                return (
                  <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="mono" style={{ color: 'var(--text-secondary)' }}>{e.type}</span>
                    <span className={`badge ${badgeClass}`}>{e.status}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>{label}</span>
      <span className={mono ? 'mono' : ''} style={{
        color: 'var(--text-secondary)',
        fontSize: mono ? '0.6875rem' : '0.8125rem',
        wordBreak: 'break-all',
        textAlign: 'right',
        maxWidth: '60%',
      }}>
        {value}
      </span>
    </div>
  );
}
