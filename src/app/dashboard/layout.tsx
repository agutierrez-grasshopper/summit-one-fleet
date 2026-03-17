import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import Link from 'next/link';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Overview', icon: '~' },
  { href: '/dashboard/assets', label: 'Assets', icon: 'A' },
  { href: '/dashboard/inspections', label: 'Inspections', icon: 'I' },
  { href: '/dashboard/work-orders', label: 'Work Orders', icon: 'W' },
  { href: '/dashboard/equipment', label: 'Equipment', icon: 'E' },
  { href: '/dashboard/geofences', label: 'Geofences', icon: 'G' },
  { href: '/dashboard/telemetry', label: 'Telemetry', icon: 'T' },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let session;
  try {
    session = await getSession();
  } catch {
    session = null;
  }
  if (!session) redirect(process.env.NEXT_PUBLIC_CORE_APP_URL || '/');

  const initials = (session.name || session.email || '?').slice(0, 2).toUpperCase();

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <aside style={{
        width: 220,
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        zIndex: 10,
      }}>
        {/* Logo */}
        <div style={{ padding: '1.25rem 1rem', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem',
              fontWeight: 700,
              color: '#fff',
            }}>
              F
            </div>
            <div>
              <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }}>Fleet</p>
              <p style={{ margin: 0, fontSize: '0.625rem', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>SUMMIT ONE</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '0.5rem 0', overflowY: 'auto' }}>
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className="nav-link">
              <span style={{
                width: 22,
                height: 22,
                borderRadius: 5,
                background: 'var(--bg-elevated)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.625rem',
                fontWeight: 600,
                color: 'var(--text-muted)',
                flexShrink: 0,
              }}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          ))}
        </nav>

        {/* User */}
        <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: 'var(--bg-elevated)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.625rem',
              fontWeight: 600,
              color: 'var(--text-muted)',
              flexShrink: 0,
            }}>
              {initials}
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {session.name || session.email}
              </p>
              <p style={{ margin: 0, fontSize: '0.625rem', color: 'var(--text-muted)' }}>{session.role}</p>
            </div>
          </div>
          <a href="/api/auth/logout" style={{
            display: 'block',
            marginTop: '0.5rem',
            fontSize: '0.6875rem',
            color: 'var(--text-muted)',
            transition: 'color 0.15s',
          }}>
            Sign out
          </a>
        </div>
      </aside>

      {/* Content */}
      <main style={{ flex: 1, marginLeft: 220, padding: '2rem 2.5rem', maxWidth: 1100 }}>
        {children}
      </main>
    </div>
  );
}
