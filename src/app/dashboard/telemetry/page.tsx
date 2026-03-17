import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import { createTenantServiceClient } from '@rocketmanv9/chassis/supabase';

function formatTimestamp(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatNum(n: number | null, decimals = 1) {
  if (n == null) return '—';
  return n.toFixed(decimals);
}

export default async function TelemetryPage() {
  const session = await getSession();
  if (!session) redirect(process.env.NEXT_PUBLIC_CORE_APP_URL || "/");
  const tenantId = session.tenantId || "__none__";
  const supabase = await createTenantServiceClient({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    tenantId,
  });

  const { data, count } = await supabase
    .from('telemetry_data')
    .select('*, assets(name)', { count: 'exact' })
    .order('recorded_at', { ascending: false })
    .limit(100);

  const records = data ?? [];

  return (
    <div>
      <div className="page-header">
        <h1>Telemetry</h1>
        <p>{count ?? records.length} total records (showing latest 100)</p>
      </div>

      {records.length === 0 ? (
        <div className="panel empty-state"><p>No telemetry data yet</p></div>
      ) : (
        <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Lat</th>
                <th>Lng</th>
                <th>Speed</th>
                <th>Heading</th>
                <th>Fuel</th>
                <th>Odometer</th>
                <th>Recorded</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r: any) => (
                <tr key={r.id}>
                  <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{r.assets?.name || r.asset_id?.slice(0, 8) + '...'}</td>
                  <td className="mono">{formatNum(r.latitude, 4)}</td>
                  <td className="mono">{formatNum(r.longitude, 4)}</td>
                  <td>{r.speed != null ? `${formatNum(r.speed, 0)} mph` : '—'}</td>
                  <td>{r.heading != null ? `${formatNum(r.heading, 0)}°` : '—'}</td>
                  <td>{r.fuel_level != null ? `${formatNum(r.fuel_level, 0)}%` : '—'}</td>
                  <td>{r.odometer != null ? formatNum(r.odometer, 0) : '—'}</td>
                  <td>{formatTimestamp(r.recorded_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
