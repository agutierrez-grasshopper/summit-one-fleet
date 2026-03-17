import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import { createTenantServiceClient } from '@rocketmanv9/chassis/supabase';

const statusBadge: Record<string, string> = {
  pending: 'badge-blue',
  in_progress: 'badge-yellow',
  completed: 'badge-green',
  failed: 'badge-red',
};

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default async function InspectionsPage() {
  const session = await getSession();
  if (!session) redirect(process.env.NEXT_PUBLIC_CORE_APP_URL || "/");
  const tenantId = session.tenantId || "__none__";
  const supabase = await createTenantServiceClient({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    tenantId,
  });

  const { data, count } = await supabase
    .from('inspections')
    .select('*, assets(name)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(50);

  const records = data ?? [];

  return (
    <div>
      <div className="page-header">
        <h1>Inspections</h1>
        <p>{count ?? records.length} total records</p>
      </div>

      {records.length === 0 ? (
        <div className="panel empty-state"><p>No inspections yet</p></div>
      ) : (
        <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Type</th>
                <th>Status</th>
                <th>Inspector</th>
                <th>Completed</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r: any) => (
                <tr key={r.id}>
                  <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{r.assets?.name || r.asset_id?.slice(0, 8) + '...'}</td>
                  <td>{r.type ?? '—'}</td>
                  <td><span className={`badge ${statusBadge[r.status] || 'badge-gray'}`}>{r.status}</span></td>
                  <td className="mono">{r.inspector_id ? r.inspector_id.slice(0, 8) + '...' : '—'}</td>
                  <td>{formatDate(r.completed_at)}</td>
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
