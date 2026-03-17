import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import { createTenantServiceClient } from '@rocketmanv9/chassis/supabase';

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default async function EquipmentPage() {
  const session = await getSession();
  if (!session) redirect(process.env.NEXT_PUBLIC_CORE_APP_URL || "/");
  const tenantId = session.tenantId || "__none__";
  const supabase = await createTenantServiceClient({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    tenantId,
  });

  const { data, count } = await supabase
    .from('equipment')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(50);

  const records = data ?? [];

  return (
    <div>
      <div className="page-header">
        <h1>Equipment</h1>
        <p>{count ?? records.length} total records</p>
      </div>

      {records.length === 0 ? (
        <div className="panel empty-state"><p>No equipment yet</p></div>
      ) : (
        <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Status</th>
                <th>Serial Number</th>
                <th>Manufacturer</th>
                <th>Model</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r: any) => (
                <tr key={r.id}>
                  <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{r.name}</td>
                  <td>{r.type ?? '—'}</td>
                  <td><span className={`badge ${r.status === 'active' ? 'badge-green' : 'badge-gray'}`}>{r.status}</span></td>
                  <td className="mono">{r.serial_number ?? '—'}</td>
                  <td>{r.manufacturer ?? '—'}</td>
                  <td>{r.model ?? '—'}</td>
                  <td>{formatDate(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
