import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import { createTenantServiceClient } from '@rocketmanv9/chassis/supabase';

const statusBadge: Record<string, string> = {
  active: 'badge-green',
  maintenance: 'badge-yellow',
  down: 'badge-red',
  retired: 'badge-gray',
  pending: 'badge-blue',
};

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default async function AssetsPage() {
  const session = await getSession();
  if (!session) redirect(process.env.NEXT_PUBLIC_CORE_APP_URL || "/");
  const tenantId = session.tenantId || "__none__";
  const supabase = await createTenantServiceClient({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    tenantId,
  });

  const { data, count } = await supabase
    .from('assets')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(50);

  const records = data ?? [];

  return (
    <div>
      <div className="page-header">
        <h1>Assets</h1>
        <p>{count ?? records.length} total records</p>
      </div>

      {records.length === 0 ? (
        <div className="panel empty-state">
          <p>No assets yet</p>
        </div>
      ) : (
        <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Class</th>
                <th>Status</th>
                <th>VIN</th>
                <th>License Plate</th>
                <th>Make / Model</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {records.map((a: any) => (
                <tr key={a.id}>
                  <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{a.name || '—'}</td>
                  <td>{a.asset_class ?? '—'}</td>
                  <td><span className={`badge ${statusBadge[a.status] || 'badge-gray'}`}>{a.status}</span></td>
                  <td className="mono">{a.vin ?? '—'}</td>
                  <td>{a.license_plate ?? '—'}</td>
                  <td>{[a.make, a.model].filter(Boolean).join(' ') || '—'}</td>
                  <td>{formatDate(a.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
