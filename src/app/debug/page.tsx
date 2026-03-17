'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  listCatalogVendors, getCatalogVendor, listIndustryTags,
  listCatalogContacts, listCatalogAddresses,
  listVendors, createVendor, deleteVendor, adoptVendors,
  listContacts, createContact, deleteContact,
  listAddresses, createAddress, deleteAddress,
  submitToCatalog, getSubmission, withdrawSubmission,
} from './vendor-actions';

type DiagnosticCheck = {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  remediation?: string;
};

type DiagnosticResult = {
  ok: boolean;
  timestamp: string;
  environment: string;
  checks: DiagnosticCheck[];
  counts: { pass: number; fail: number; warn: number; total: number };
};

type SessionInfo = {
  authenticated: boolean;
  userId?: string;
  email?: string;
  tenantId?: string | null;
  name?: string;
  role?: string;
};

const CORE_APP_URL = process.env.NEXT_PUBLIC_CORE_APP_URL || '';
const SERVICE_NAME = process.env.NEXT_PUBLIC_SERVICE_NAME || '';

export default function DebugPage() {
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'auth' | 'diagnostics' | 'gv' | 'vendors'>('auth');
  const [callbackUrl, setCallbackUrl] = useState('');

  const fetchDiagnostics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/system/debug');
      if (res.status === 404) {
        setError('Debug diagnostics are not available in production.');
        setResult(null);
        return;
      }
      if (!res.ok) {
        setError(`Failed to fetch diagnostics: ${res.status}`);
        setResult(null);
        return;
      }
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSession = useCallback(async () => {
    setSessionLoading(true);
    try {
      const res = await fetch('/api/auth/session');
      const data = await res.json();
      setSession(data);
    } catch {
      setSession({ authenticated: false });
    } finally {
      setSessionLoading(false);
    }
  }, []);

  useEffect(() => {
    setCallbackUrl(window.location.origin + '/auth/callback');
    fetchSession();
    fetchDiagnostics();
  }, [fetchSession, fetchDiagnostics]);

  const handleLogin = () => {
    const callbackUrl = encodeURIComponent(window.location.origin + '/auth/callback');
    const loginUrl = `${CORE_APP_URL}/auth/login?callback_url=${callbackUrl}&target_service=${SERVICE_NAME}`;
    window.location.href = loginUrl;
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setSession({ authenticated: false });
    } catch {
      // ignore
    }
  };

  const statusIcon = (status: string) => {
    if (status === 'pass') return '✅';
    if (status === 'fail') return '❌';
    return '⚠️';
  };

  const statusColor = (status: string) => {
    if (status === 'pass') return '#22c55e';
    if (status === 'fail') return '#ef4444';
    return '#f59e0b';
  };

  const cardStyle = {
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: '1rem',
    marginBottom: '1rem',
    background: '#fff',
  };

  const btnStyle = (variant: 'primary' | 'danger' | 'secondary') => ({
    padding: '0.5rem 1rem',
    borderRadius: 6,
    border: variant === 'primary' ? 'none' : '1px solid #d1d5db',
    background: variant === 'primary' ? '#2563eb' : variant === 'danger' ? '#ef4444' : '#fff',
    color: variant === 'primary' || variant === 'danger' ? '#fff' : '#374151',
    cursor: 'pointer' as const,
    fontSize: '0.875rem',
    fontWeight: 500 as const,
  });

  const tabStyle = (active: boolean) => ({
    padding: '0.5rem 1.5rem',
    border: 'none',
    borderBottom: active ? '2px solid #2563eb' : '2px solid transparent',
    background: 'none',
    color: active ? '#2563eb' : '#6b7280',
    cursor: 'pointer' as const,
    fontSize: '0.9rem',
    fontWeight: active ? 600 : 400 as number,
  });

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', maxWidth: 800, margin: '0 auto', padding: '2rem' }}>
      <h1 style={{ margin: 0, fontSize: '1.5rem', marginBottom: '1rem' }}>Chassis Debug</h1>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e5e7eb', marginBottom: '1.5rem' }}>
        <button style={tabStyle(activeTab === 'auth')} onClick={() => setActiveTab('auth')}>Auth / SSO</button>
        <button style={tabStyle(activeTab === 'diagnostics')} onClick={() => setActiveTab('diagnostics')}>Diagnostics</button>
        <button style={tabStyle(activeTab === 'gv')} onClick={() => setActiveTab('gv')}>Global Values</button>
        <button style={tabStyle(activeTab === 'vendors')} onClick={() => setActiveTab('vendors')}>Vendors</button>
      </div>

      {/* ── Auth Tab ── */}
      {activeTab === 'auth' && (
        <div>
          {/* Session Status */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h2 style={{ margin: 0, fontSize: '1rem' }}>Session Status</h2>
              <button onClick={fetchSession} disabled={sessionLoading} style={btnStyle('secondary')}>
                {sessionLoading ? 'Checking...' : 'Refresh'}
              </button>
            </div>

            {sessionLoading && !session && (
              <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>Checking session...</div>
            )}

            {session && !session.authenticated && (
              <div>
                {!CORE_APP_URL ? (
                  <div style={{ padding: '0.75rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, marginBottom: '1rem', fontSize: '0.875rem', color: '#991b1b' }}>
                    <strong>NEXT_PUBLIC_CORE_APP_URL is not set.</strong> SSO login requires this variable. Add it to your .env.local and restart the dev server.
                  </div>
                ) : (
                  <div style={{ padding: '0.75rem', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 6, marginBottom: '1rem', fontSize: '0.875rem' }}>
                    Not authenticated. Log in with Core to test the SSO flow.
                  </div>
                )}
                <button onClick={handleLogin} disabled={!CORE_APP_URL} style={{ ...btnStyle('primary'), ...(CORE_APP_URL ? {} : { opacity: 0.5, cursor: 'not-allowed' }) }}>
                  Login with Core
                </button>
              </div>
            )}

            {session && session.authenticated && (
              <div>
                <div style={{ padding: '0.75rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, marginBottom: '1rem', fontSize: '0.875rem' }}>
                  ✅ Authenticated
                </div>
                <table style={{ width: '100%', fontSize: '0.875rem', borderCollapse: 'collapse' }}>
                  <tbody>
                    {[
                      ['User ID', session.userId],
                      ['Email', session.email],
                      ['Name', session.name],
                      ['Tenant ID', session.tenantId ?? '(none)'],
                      ['Role', session.role],
                    ].map(([label, value]) => (
                      <tr key={label as string} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '0.4rem 0', color: '#6b7280', width: 120 }}>{label}</td>
                        <td style={{ padding: '0.4rem 0' }}>
                          <code style={{ fontSize: '0.8rem', background: '#f3f4f6', padding: '2px 6px', borderRadius: 4 }}>{value || '—'}</code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                  <button onClick={handleLogout} style={btnStyle('danger')}>Logout</button>
                  <button onClick={fetchSession} style={btnStyle('secondary')}>Refresh Session</button>
                </div>
              </div>
            )}
          </div>

          {/* SSO Flow Test */}
          <div style={cardStyle}>
            <h2 style={{ margin: 0, fontSize: '1rem', marginBottom: '0.75rem' }}>SSO Endpoints</h2>
            <div style={{ fontSize: '0.8rem', fontFamily: 'monospace', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {[
                ['GET', '/auth/callback', 'SSO callback (Core redirects here with ticket)'],
                ['GET', '/api/auth/token', 'Get access token from cookie'],
                ['POST', '/api/auth/refresh', 'Refresh session tokens'],
                ['GET', '/api/auth/session', 'Get current session info'],
                ['POST', '/api/auth/logout', 'Clear session cookies'],
              ].map(([method, path, desc]) => (
                <div key={path as string} style={{ display: 'flex', gap: '0.5rem', padding: '0.3rem 0', borderBottom: '1px solid #f3f4f6' }}>
                  <span style={{ color: method === 'GET' ? '#22c55e' : '#f59e0b', width: 40 }}>{method}</span>
                  <span style={{ color: '#2563eb', width: 180 }}>{path}</span>
                  <span style={{ color: '#6b7280' }}>{desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Config */}
          <div style={cardStyle}>
            <h2 style={{ margin: 0, fontSize: '1rem', marginBottom: '0.75rem' }}>SSO Config</h2>
            <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse', fontFamily: 'monospace' }}>
              <tbody>
                {[
                  ['NEXT_PUBLIC_CORE_APP_URL', CORE_APP_URL || '(not set)'],
                  ['NEXT_PUBLIC_SERVICE_NAME', SERVICE_NAME || '(not set)'],
                  ['Callback URL', callbackUrl],
                ].map(([label, value]) => (
                  <tr key={label as string} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '0.4rem 0', color: '#6b7280', width: 240 }}>{label}</td>
                    <td style={{ padding: '0.4rem 0' }}>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Diagnostics Tab ── */}
      {activeTab === 'diagnostics' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
            <button
              onClick={fetchDiagnostics}
              disabled={loading}
              style={btnStyle('secondary')}
            >
              {loading ? 'Checking...' : 'Re-run'}
            </button>
          </div>

          {error && (
            <div style={{ padding: '1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#991b1b', marginBottom: '1rem' }}>
              {error}
            </div>
          )}

          {loading && !result && (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
              Running diagnostics...
            </div>
          )}

          {result && (
            <>
              <div style={{
                padding: '1rem',
                background: result.ok ? '#f0fdf4' : '#fef2f2',
                border: `1px solid ${result.ok ? '#bbf7d0' : '#fecaca'}`,
                borderRadius: 8,
                marginBottom: '1.5rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <div>
                  <strong>{result.ok ? 'All checks passed' : `${result.counts.fail} failure(s), ${result.counts.warn} warning(s)`}</strong>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 4 }}>
                    {result.environment} &middot; {new Date(result.timestamp).toLocaleTimeString()}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.875rem' }}>
                  <span style={{ color: '#22c55e' }}>{result.counts.pass} pass</span>
                  <span style={{ color: '#ef4444' }}>{result.counts.fail} fail</span>
                  <span style={{ color: '#f59e0b' }}>{result.counts.warn} warn</span>
                </div>
              </div>

              {['fail', 'warn', 'pass'].map((status) => {
                const group = result.checks.filter((c) => c.status === status);
                if (group.length === 0) return null;

                const label = status === 'fail' ? 'Failures' : status === 'warn' ? 'Warnings' : 'Passing';

                return (
                  <div key={status} style={{ marginBottom: '1.5rem' }}>
                    <h2 style={{ fontSize: '1rem', marginBottom: '0.5rem', color: statusColor(status) }}>{label} ({group.length})</h2>
                    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
                      {group.map((check, i) => (
                        <div
                          key={check.name}
                          style={{
                            padding: '0.75rem 1rem',
                            borderBottom: i < group.length - 1 ? '1px solid #e5e7eb' : 'none',
                            background: i % 2 === 0 ? '#fff' : '#fafafa',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span>{statusIcon(check.status)}</span>
                            <code style={{ fontSize: '0.8rem', color: '#6b7280' }}>{check.name}</code>
                          </div>
                          <div style={{ marginLeft: '1.75rem', fontSize: '0.875rem', marginTop: 2 }}>
                            {check.message}
                          </div>
                          {check.remediation && check.status !== 'pass' && (
                            <div style={{
                              marginLeft: '1.75rem',
                              marginTop: 4,
                              fontSize: '0.8rem',
                              color: '#4b5563',
                              background: '#f9fafb',
                              padding: '0.25rem 0.5rem',
                              borderRadius: 4,
                              border: '1px solid #e5e7eb',
                            }}>
                              {check.remediation}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* ── Global Values Tab ── */}
      {activeTab === 'gv' && (
        <GVTab cardStyle={cardStyle} btnStyle={btnStyle} />
      )}

      {/* ── Vendors Tab ── */}
      {activeTab === 'vendors' && (
        <VendorsTab cardStyle={cardStyle} btnStyle={btnStyle} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Global Values Tab — Overrides & Aliases Reference + Admin Testing
// ---------------------------------------------------------------------------

function GVTab({ cardStyle, btnStyle }: { cardStyle: React.CSSProperties; btnStyle: (v: 'primary' | 'danger' | 'secondary') => React.CSSProperties }) {
  const [tenantId, setTenantId] = useState('');
  const [domainKey, setDomainKey] = useState('');

  // Override form
  const [ovTermId, setOvTermId] = useState('');
  const [ovLabel, setOvLabel] = useState('');
  const [ovShortLabel, setOvShortLabel] = useState('');
  const [ovHidden, setOvHidden] = useState(false);
  const [ovSortOrder, setOvSortOrder] = useState('');
  const [ovReason, setOvReason] = useState('');

  // Alias form
  const [alTermId, setAlTermId] = useState('');
  const [alAlias, setAlAlias] = useState('');
  const [alReason, setAlReason] = useState('');
  const [alDeleteId, setAlDeleteId] = useState('');

  // Results
  const [overrides, setOverrides] = useState<any[] | null>(null);
  const [aliases, setAliases] = useState<any[] | null>(null);
  const [gvLog, setGvLog] = useState<Array<{ time: string; action: string; ok: boolean; detail: string }>>([]);

  const addLog = (action: string, ok: boolean, detail: string) => {
    setGvLog(prev => [{ time: new Date().toLocaleTimeString(), action, ok, detail }, ...prev].slice(0, 20));
  };

  const idemKey = () => crypto.randomUUID();

  const inputStyle: React.CSSProperties = {
    padding: '0.4rem 0.6rem', borderRadius: 4, border: '1px solid #d1d5db',
    fontSize: '0.8rem', fontFamily: 'monospace', width: '100%', boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '0.75rem', color: '#6b7280', marginBottom: 2, display: 'block',
  };

  const sectionHeading: React.CSSProperties = {
    margin: 0, fontSize: '1rem', marginBottom: '0.75rem',
  };

  const codeBlock: React.CSSProperties = {
    background: '#f3f4f6', padding: '0.75rem', borderRadius: 6, fontSize: '0.75rem',
    fontFamily: 'monospace', whiteSpace: 'pre-wrap', overflowX: 'auto', lineHeight: 1.5,
  };

  // ── Fetch helpers ──

  const fetchOverrides = async () => {
    if (!tenantId) { addLog('GET overrides', false, 'tenant_id is required'); return; }
    try {
      const params = new URLSearchParams({ tenant_id: tenantId });
      if (domainKey) params.set('domain_key', domainKey);
      const res = await fetch(`/api/admin/gv/overrides?${params}`);
      const data = await res.json();
      if (!res.ok) { addLog('GET overrides', false, data.error || res.statusText); return; }
      setOverrides(data.data ?? data);
      addLog('GET overrides', true, `${(data.data ?? data).length} result(s)`);
    } catch (e: any) { addLog('GET overrides', false, e.message); }
  };

  const fetchAliases = async () => {
    if (!tenantId) { addLog('GET aliases', false, 'tenant_id is required'); return; }
    try {
      const params = new URLSearchParams({ tenant_id: tenantId });
      if (domainKey) params.set('domain_key', domainKey);
      const res = await fetch(`/api/admin/gv/aliases?${params}`);
      const data = await res.json();
      if (!res.ok) { addLog('GET aliases', false, data.error || res.statusText); return; }
      setAliases(data.data ?? data);
      addLog('GET aliases', true, `${(data.data ?? data).length} result(s)`);
    } catch (e: any) { addLog('GET aliases', false, e.message); }
  };

  const createOverride = async () => {
    if (!tenantId || !ovTermId || !ovLabel) { addLog('POST override', false, 'tenant_id, term_id, and label are required'); return; }
    try {
      const body: any = { tenant_id: tenantId, term_id: ovTermId, label: ovLabel };
      if (ovShortLabel) body.short_label = ovShortLabel;
      if (ovHidden) body.hidden = true;
      if (ovSortOrder) body.sort_order = Number(ovSortOrder);
      if (ovReason) body.change_reason = ovReason;
      const res = await fetch('/api/admin/gv/overrides', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idemKey() },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { addLog('POST override', false, data.error || res.statusText); return; }
      addLog('POST override', true, `Override created for term ${ovTermId}`);
      fetchOverrides();
    } catch (e: any) { addLog('POST override', false, e.message); }
  };

  const deleteOverride = async (termId: string) => {
    try {
      const res = await fetch('/api/admin/gv/overrides', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idemKey() },
        body: JSON.stringify({ tenant_id: tenantId, term_id: termId }),
      });
      const data = await res.json();
      if (!res.ok) { addLog('DELETE override', false, data.error || res.statusText); return; }
      addLog('DELETE override', true, `Override removed for term ${termId}`);
      fetchOverrides();
    } catch (e: any) { addLog('DELETE override', false, e.message); }
  };

  const createAlias = async () => {
    if (!tenantId || !alTermId || !alAlias) { addLog('POST alias', false, 'tenant_id, term_id, and alias are required'); return; }
    try {
      const body: any = { tenant_id: tenantId, term_id: alTermId, alias: alAlias };
      if (alReason) body.change_reason = alReason;
      const res = await fetch('/api/admin/gv/aliases', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idemKey() },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { addLog('POST alias', false, data.error || res.statusText); return; }
      addLog('POST alias', true, `Alias "${alAlias}" mapped to term ${alTermId}`);
      fetchAliases();
    } catch (e: any) { addLog('POST alias', false, e.message); }
  };

  const deleteAlias = async (aliasId: string) => {
    try {
      const res = await fetch(`/api/admin/gv/aliases/${aliasId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { addLog('DELETE alias', false, data.error || res.statusText); return; }
      addLog('DELETE alias', true, `Alias ${aliasId} deleted`);
      fetchAliases();
    } catch (e: any) { addLog('DELETE alias', false, e.message); }
  };

  return (
    <div>
      {/* ── Concepts ── */}
      <div style={cardStyle}>
        <h2 style={sectionHeading}>Core Concepts</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
          <div style={{ padding: '0.75rem', background: '#faf5ff', borderRadius: 6, border: '1px solid #e9d5ff' }}>
            <strong style={{ fontSize: '0.85rem' }}>Term Ownership</strong>
            <div style={{ fontSize: '0.8rem', marginTop: 4, color: '#6b21a8' }}>
              Terms live in one shared table (<code style={{ fontSize: '0.75rem' }}>gv_terms</code>) with an <code style={{ fontSize: '0.75rem' }}>owner_tenant_id</code> field.
              <strong> NULL</strong> = global canonical term visible to all tenants.
              <strong> UUID</strong> = tenant-owned term, scoped to that tenant only.
            </div>
            <div style={{ fontSize: '0.75rem', marginTop: 8, color: '#6b7280' }}>
              Example: 5 global location types exist for everyone. Acme Corp adds a 6th "Yard" type &mdash; only Acme sees it.
            </div>
          </div>
          <div style={{ padding: '0.75rem', background: '#eff6ff', borderRadius: 6, border: '1px solid #bfdbfe' }}>
            <strong style={{ fontSize: '0.85rem' }}>Display Override</strong>
            <div style={{ fontSize: '0.8rem', marginTop: 4, color: '#1e40af' }}>
              Tenant-level <em>cosmetic</em> customization. Changes how a term is <strong>displayed</strong> (label, short_label, hidden, sort_order)
              but does NOT change the underlying term. One override per tenant + term pair.
            </div>
            <div style={{ fontSize: '0.75rem', marginTop: 8, color: '#6b7280' }}>
              Example: Term "FILL_MATERIAL" has default label "Fill Material". Tenant overrides it to show "Durafill" in their UI.
            </div>
          </div>
          <div style={{ padding: '0.75rem', background: '#f0fdf4', borderRadius: 6, border: '1px solid #bbf7d0' }}>
            <strong style={{ fontSize: '0.85rem' }}>Alias</strong>
            <div style={{ fontSize: '0.8rem', marginTop: 4, color: '#166534' }}>
              Tenant-level <em>input mapping</em>. Maps an alternate string (brand name, abbreviation, local jargon)
              to a canonical term so the system can <strong>resolve user input</strong>. One alias per tenant + domain + text.
            </div>
            <div style={{ fontSize: '0.75rem', marginTop: 8, color: '#6b7280' }}>
              Example: Tenant creates alias "DF" that maps to the "Fill Material" term, so typing "DF" in search resolves correctly.
            </div>
          </div>
        </div>
      </div>

      {/* ── Term Resolution Flow ── */}
      <div style={cardStyle}>
        <h2 style={sectionHeading}>How Term Resolution Works</h2>
        <div style={{ fontSize: '0.8rem', color: '#374151' }}>
          When <code style={{ background: '#f3f4f6', padding: '1px 4px', borderRadius: 3 }}>resolveTermId(tenantId, domain, input)</code> is called, it tries these strategies in order:
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
          {[
            { step: '1', label: 'Alias match', desc: 'Check tenant aliases (case-insensitive)' },
            { step: '2', label: 'Code match', desc: 'Exact term code in the domain' },
            { step: '3', label: 'Label match', desc: 'Normalized default_label in the domain' },
            { step: '4', label: 'Auto-create', desc: 'If enabled, creates TENANT_ prefixed term' },
          ].map(s => (
            <div key={s.step} style={{ flex: '1 1 140px', padding: '0.5rem', background: '#fafafa', border: '1px solid #e5e7eb', borderRadius: 6, textAlign: 'center' }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#2563eb' }}>{s.step}</div>
              <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{s.label}</div>
              <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: 2 }}>{s.desc}</div>
            </div>
          ))}
        </div>
        {/* Auto-create detail */}
        <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 6 }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#6b21a8', marginBottom: 4 }}>Step 4: Auto-create detail</div>
          <div style={{ fontSize: '0.78rem', color: '#374151' }}>
            When no match is found and <code style={{ background: '#f3f4f6', padding: '1px 4px', borderRadius: 3 }}>createIfMissing = true</code>, the RPC creates a <strong>tenant-owned</strong> term:
          </div>
          <pre style={{ ...codeBlock, marginTop: 8, fontSize: '0.72rem' }}>{`gv_terms row created:
  term_id:          <new-uuid>
  domain_id:        <domain-uuid>          // the domain you're resolving in
  code:             "TENANT_YARD"          // auto-prefixed with TENANT_
  default_label:    "Yard"                 // the original user input
  owner_tenant_id:  <your-tenant-uuid>     // scoped to this tenant only
  is_active:        true`}</pre>
          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 6 }}>
            Other tenants will never see this term. It only appears when listing terms for the owning tenant.
          </div>
        </div>
      </div>

      {/* ── What Your Service Sees ── */}
      <div style={cardStyle}>
        <h2 style={sectionHeading}>What Your Service Sees</h2>
        <div style={{ fontSize: '0.8rem', color: '#374151', marginBottom: '0.75rem' }}>
          When a microservice calls <code style={{ background: '#f3f4f6', padding: '1px 4px', borderRadius: 3 }}>gv.listTerms(tenantId, 'location_types')</code>,
          it gets back the combined list &mdash; the service doesn't need to care about ownership:
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>Acme Corp sees (6 terms):</div>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden', fontSize: '0.72rem', fontFamily: 'monospace' }}>
              {[
                { code: 'WAREHOUSE', label: 'Warehouse', owner: null },
                { code: 'STORE', label: 'Retail Store', owner: null },
                { code: 'DISTRIBUTION_CENTER', label: 'Distribution Center', owner: null },
                { code: 'OFFICE', label: 'Office', owner: null },
                { code: 'REMOTE', label: 'Remote Site', owner: null },
                { code: 'TENANT_YARD', label: 'Yard', owner: 'acme-uuid' },
              ].map((t, i) => (
                <div key={t.code} style={{ padding: '0.3rem 0.5rem', borderBottom: i < 5 ? '1px solid #f3f4f6' : 'none', display: 'flex', justifyContent: 'space-between', background: t.owner ? '#faf5ff' : '#fff' }}>
                  <span>{t.label}</span>
                  <span style={{ color: t.owner ? '#7c3aed' : '#9ca3af', fontSize: '0.65rem' }}>
                    {t.owner ? 'tenant-owned' : 'global'}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>Other tenants see (5 terms):</div>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden', fontSize: '0.72rem', fontFamily: 'monospace' }}>
              {[
                { code: 'WAREHOUSE', label: 'Warehouse' },
                { code: 'STORE', label: 'Retail Store' },
                { code: 'DISTRIBUTION_CENTER', label: 'Distribution Center' },
                { code: 'OFFICE', label: 'Office' },
                { code: 'REMOTE', label: 'Remote Site' },
              ].map((t, i) => (
                <div key={t.code} style={{ padding: '0.3rem 0.5rem', borderBottom: i < 4 ? '1px solid #f3f4f6' : 'none', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{t.label}</span>
                  <span style={{ color: '#9ca3af', fontSize: '0.65rem' }}>global</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, fontSize: '0.78rem', color: '#166534' }}>
          The microservice just calls <code style={{ fontSize: '0.72rem' }}>listTerms()</code> and gets the right list. Global terms (owner_tenant_id = NULL) are always included. Tenant-owned terms only appear for their owner. Overrides are layered on top for display labels.
        </div>
      </div>

      {/* ── Shared Context (tenant + domain) ── */}
      <div style={cardStyle}>
        <h2 style={sectionHeading}>Test Context</h2>
        <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.75rem' }}>
          Set the tenant and domain to use for all operations below. Get your tenant_id from the Auth tab session info.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div>
            <label style={labelStyle}>tenant_id (required)</label>
            <input style={inputStyle} placeholder="uuid" value={tenantId} onChange={e => setTenantId(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>domain_key (optional filter)</label>
            <input style={inputStyle} placeholder="e.g. materials" value={domainKey} onChange={e => setDomainKey(e.target.value)} />
          </div>
        </div>
      </div>

      {/* ── Overrides Section ── */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h2 style={{ margin: 0, fontSize: '1rem' }}>Display Overrides</h2>
          <button onClick={fetchOverrides} style={btnStyle('secondary')}>Fetch Overrides</button>
        </div>

        {/* Create override form */}
        <div style={{ padding: '0.75rem', background: '#f9fafb', borderRadius: 6, border: '1px solid #e5e7eb', marginBottom: '0.75rem' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem' }}>Create / Update Override</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <div>
              <label style={labelStyle}>term_id *</label>
              <input style={inputStyle} placeholder="uuid" value={ovTermId} onChange={e => setOvTermId(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>label *</label>
              <input style={inputStyle} placeholder="Display label" value={ovLabel} onChange={e => setOvLabel(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>short_label</label>
              <input style={inputStyle} placeholder="Optional" value={ovShortLabel} onChange={e => setOvShortLabel(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>sort_order</label>
              <input style={inputStyle} type="number" placeholder="Optional" value={ovSortOrder} onChange={e => setOvSortOrder(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>change_reason</label>
              <input style={inputStyle} placeholder="Optional" value={ovReason} onChange={e => setOvReason(e.target.value)} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem' }}>
              <label style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" checked={ovHidden} onChange={e => setOvHidden(e.target.checked)} /> hidden
              </label>
              <button onClick={createOverride} style={btnStyle('primary')}>Create Override</button>
            </div>
          </div>
        </div>

        {/* Override results table */}
        {overrides && (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'auto', maxHeight: 300 }}>
            <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse', fontFamily: 'monospace' }}>
              <thead>
                <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                  <th style={{ padding: '0.4rem 0.6rem' }}>term_id</th>
                  <th style={{ padding: '0.4rem 0.6rem' }}>label</th>
                  <th style={{ padding: '0.4rem 0.6rem' }}>short</th>
                  <th style={{ padding: '0.4rem 0.6rem' }}>hidden</th>
                  <th style={{ padding: '0.4rem 0.6rem' }}>sort</th>
                  <th style={{ padding: '0.4rem 0.6rem' }}></th>
                </tr>
              </thead>
              <tbody>
                {overrides.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: '1rem', textAlign: 'center', color: '#9ca3af' }}>No overrides found</td></tr>
                )}
                {overrides.map((ov: any, i: number) => (
                  <tr key={ov.term_id || i} style={{ borderTop: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '0.4rem 0.6rem', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }} title={ov.term_id}>{ov.term_id?.slice(0, 8)}...</td>
                    <td style={{ padding: '0.4rem 0.6rem' }}>{ov.label}</td>
                    <td style={{ padding: '0.4rem 0.6rem' }}>{ov.short_label || '—'}</td>
                    <td style={{ padding: '0.4rem 0.6rem' }}>{ov.hidden ? 'yes' : 'no'}</td>
                    <td style={{ padding: '0.4rem 0.6rem' }}>{ov.sort_order ?? '—'}</td>
                    <td style={{ padding: '0.4rem 0.6rem' }}>
                      <button onClick={() => deleteOverride(ov.term_id)} style={{ ...btnStyle('danger'), padding: '2px 8px', fontSize: '0.7rem' }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Aliases Section ── */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h2 style={{ margin: 0, fontSize: '1rem' }}>Aliases</h2>
          <button onClick={fetchAliases} style={btnStyle('secondary')}>Fetch Aliases</button>
        </div>

        {/* Create alias form */}
        <div style={{ padding: '0.75rem', background: '#f9fafb', borderRadius: 6, border: '1px solid #e5e7eb', marginBottom: '0.75rem' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem' }}>Create Alias</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
            <div>
              <label style={labelStyle}>term_id *</label>
              <input style={inputStyle} placeholder="uuid" value={alTermId} onChange={e => setAlTermId(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>alias *</label>
              <input style={inputStyle} placeholder='e.g. "DF" or "Durafill"' value={alAlias} onChange={e => setAlAlias(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>change_reason</label>
              <input style={inputStyle} placeholder="Optional" value={alReason} onChange={e => setAlReason(e.target.value)} />
            </div>
          </div>
          <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
            <button onClick={createAlias} style={btnStyle('primary')}>Create Alias</button>
          </div>
        </div>

        {/* Delete alias by ID */}
        <div style={{ padding: '0.5rem 0.75rem', background: '#fef2f2', borderRadius: 6, border: '1px solid #fecaca', marginBottom: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <label style={{ fontSize: '0.75rem', color: '#991b1b', whiteSpace: 'nowrap' }}>Delete by alias ID:</label>
          <input style={{ ...inputStyle, flex: 1 }} placeholder="alias uuid" value={alDeleteId} onChange={e => setAlDeleteId(e.target.value)} />
          <button onClick={() => { if (alDeleteId) deleteAlias(alDeleteId); }} style={{ ...btnStyle('danger'), padding: '0.4rem 0.75rem', fontSize: '0.75rem' }}>Delete</button>
        </div>

        {/* Alias results table */}
        {aliases && (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'auto', maxHeight: 300 }}>
            <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse', fontFamily: 'monospace' }}>
              <thead>
                <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                  <th style={{ padding: '0.4rem 0.6rem' }}>id</th>
                  <th style={{ padding: '0.4rem 0.6rem' }}>alias</th>
                  <th style={{ padding: '0.4rem 0.6rem' }}>term_id</th>
                  <th style={{ padding: '0.4rem 0.6rem' }}>domain</th>
                  <th style={{ padding: '0.4rem 0.6rem' }}></th>
                </tr>
              </thead>
              <tbody>
                {aliases.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: '1rem', textAlign: 'center', color: '#9ca3af' }}>No aliases found</td></tr>
                )}
                {aliases.map((al: any, i: number) => (
                  <tr key={al.id || i} style={{ borderTop: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '0.4rem 0.6rem', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis' }} title={al.id}>{al.id?.slice(0, 8)}...</td>
                    <td style={{ padding: '0.4rem 0.6rem', fontWeight: 600 }}>{al.alias || al.alias_text}</td>
                    <td style={{ padding: '0.4rem 0.6rem', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis' }} title={al.term_id}>{al.term_id?.slice(0, 8)}...</td>
                    <td style={{ padding: '0.4rem 0.6rem' }}>{al.domain_key || '—'}</td>
                    <td style={{ padding: '0.4rem 0.6rem' }}>
                      <button onClick={() => deleteAlias(al.id)} style={{ ...btnStyle('danger'), padding: '2px 8px', fontSize: '0.7rem' }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── SDK Client Setup ── */}
      <div style={cardStyle}>
        <h2 style={sectionHeading}>SDK Client Setup: Reads vs Writes</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div style={{ padding: '0.75rem', background: '#f0fdf4', borderRadius: 6, border: '1px solid #bbf7d0' }}>
            <strong style={{ fontSize: '0.85rem' }}>createGVClient() &mdash; reads only</strong>
            <pre style={{ ...codeBlock, marginTop: 8, fontSize: '0.72rem', background: '#ecfdf5' }}>{`import { createGVClient } from
  '@rocketmanv9/chassis/global-values';

const gv = createGVClient();  // sync, zero config
const terms = await gv.listTerms(tenantId, 'materials');
const label = await gv.displayLabel(tenantId, termId);`}</pre>
            <div style={{ fontSize: '0.72rem', color: '#166534', marginTop: 6 }}>
              No RLS context needed. Read RPCs accept tenantId as a parameter. Safe to reuse across requests.
            </div>
          </div>
          <div style={{ padding: '0.75rem', background: '#eff6ff', borderRadius: 6, border: '1px solid #bfdbfe' }}>
            <strong style={{ fontSize: '0.85rem' }}>createTenantGVClient(tenantId) &mdash; reads + writes</strong>
            <pre style={{ ...codeBlock, marginTop: 8, fontSize: '0.72rem', background: '#eff6ff' }}>{`import { createTenantGVClient } from
  '@rocketmanv9/chassis/global-values';

// async — sets RLS tenant context internally
const gv = await createTenantGVClient(tenantId);
await gv.upsertOverride({ tenantId, termId, label: 'Custom' });
await gv.upsertAlias(tenantId, termId, 'my-alias');`}</pre>
            <div style={{ fontSize: '0.72rem', color: '#1e40af', marginTop: 6 }}>
              Sets <code style={{ fontSize: '0.68rem' }}>app.current_tenant_id</code> via setRLSContext. Creates a fresh Supabase client per call for concurrency safety.
            </div>
          </div>
        </div>
        <div style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 6, fontSize: '0.78rem', color: '#92400e' }}>
          Write operations (upsertOverride, upsertAlias, resolveTermId with createIfMissing) will fail with <code style={{ fontSize: '0.72rem' }}>"app.current_tenant_id is NULL"</code> if you use createGVClient(). Always use createTenantGVClient() for writes.
        </div>
      </div>

      {/* ── Admin Guide ── */}
      <div style={cardStyle}>
        <h2 style={sectionHeading}>Admin Management Examples</h2>
        <div style={{ fontSize: '0.8rem', color: '#374151', marginBottom: '0.75rem' }}>
          Quick reference for managing overrides and aliases via the API. All mutations require admin auth and an <code style={{ background: '#f3f4f6', padding: '1px 4px', borderRadius: 3 }}>Idempotency-Key</code> header.
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>1. Override a term's display label for your tenant</div>
          <pre style={codeBlock}>{`// Make "Fill Material" show as "Durafill" for this tenant
POST /api/admin/gv/overrides
Headers: Idempotency-Key: <uuid>, Content-Type: application/json

{
  "tenant_id": "your-tenant-uuid",
  "term_id": "the-term-uuid",       // get from GET /api/admin/gv/terms?domain_key=materials
  "label": "Durafill",
  "short_label": "DF",              // optional, for compact UI
  "hidden": false,                   // optional, hide from dropdowns
  "sort_order": 10,                  // optional, custom sort position
  "change_reason": "Brand rename"   // optional, audit trail
}`}</pre>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>2. Create an input alias so "DF" resolves to the correct term</div>
          <pre style={codeBlock}>{`// When users type "DF", resolve it to the Fill Material term
POST /api/admin/gv/aliases
Headers: Idempotency-Key: <uuid>, Content-Type: application/json

{
  "tenant_id": "your-tenant-uuid",
  "term_id": "the-term-uuid",
  "alias": "DF",
  "change_reason": "Common abbreviation"
}`}</pre>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>3. Remove an override (revert to default label)</div>
          <pre style={codeBlock}>{`DELETE /api/admin/gv/overrides
Headers: Idempotency-Key: <uuid>, Content-Type: application/json
Body: { "tenant_id": "your-tenant-uuid", "term_id": "the-term-uuid" }`}</pre>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>4. Delete an alias (uses alias ID in URL, not body)</div>
          <pre style={codeBlock}>{`DELETE /api/admin/gv/aliases/<alias-uuid>
// No body needed — the alias UUID is in the URL path`}</pre>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>5. Auto-create a tenant-owned term (via SDK &mdash; uses createTenantGVClient)</div>
          <pre style={codeBlock}>{`import { createTenantGVClient } from '@rocketmanv9/chassis/global-values';

// Write operations need tenant RLS context
const gv = await createTenantGVClient(tenantId);

// If "Yard" doesn't exist as a term, code, or alias in location_types,
// this creates a tenant-owned term with code "TENANT_YARD"
const termId = await gv.resolveTermId(
  tenantId,
  'location_types',
  'Yard',
  true  // createIfMissing = true
);
// Result: new gv_terms row with owner_tenant_id = tenantId
// Only this tenant will see it in listTerms()`}</pre>
        </div>

        <div>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>6. List terms for a tenant (global + tenant-owned + overrides)</div>
          <pre style={codeBlock}>{`import { createGVClient } from '@rocketmanv9/chassis/global-values';

// Read operations work with the simple client (no RLS context needed)
const gv = createGVClient();

// Returns all global terms + any tenant-owned terms, with display overrides applied
const terms = await gv.listTerms(tenantId, 'location_types');
// Each term has: term_id, code, display_label, short_label, is_active,
//                is_hidden, sort_order, owner_tenant_id (null = global)

// Build a label map for dropdowns
const labelMap = await gv.buildLabelMap(tenantId, 'location_types');
// Map<TermId, string> — ready to render`}</pre>
        </div>
      </div>

      {/* ── Common Mistakes ── */}
      <div style={cardStyle}>
        <h2 style={sectionHeading}>Common Mistakes</h2>
        <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {[
            'Do NOT confuse overrides with aliases. Overrides change display; aliases map input.',
            'Override DELETE uses a body { tenant_id, term_id }. Alias DELETE uses the alias ID in the URL path.',
            'You need a valid term_id before creating either. Fetch terms first via the terms API.',
            'Always send Idempotency-Key on mutations to avoid duplicates.',
            'Aliases cannot point to inactive terms — the server will reject them.',
            'Use createTenantGVClient(tenantId) for writes. createGVClient() is reads only — writes will fail with "app.current_tenant_id is NULL".',
          ].map((tip, i) => (
            <div key={i} style={{ padding: '0.4rem 0.6rem', background: i % 2 === 0 ? '#fffbeb' : '#fff', borderRadius: 4, border: '1px solid #fde68a' }}>
              {tip}
            </div>
          ))}
        </div>
      </div>

      {/* ── Activity Log ── */}
      {gvLog.length > 0 && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h2 style={{ margin: 0, fontSize: '1rem' }}>Activity Log</h2>
            <button onClick={() => setGvLog([])} style={btnStyle('secondary')}>Clear</button>
          </div>
          <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', maxHeight: 200, overflowY: 'auto' }}>
            {gvLog.map((entry, i) => (
              <div key={i} style={{ padding: '0.3rem 0', borderBottom: '1px solid #f3f4f6', display: 'flex', gap: '0.5rem' }}>
                <span style={{ color: '#9ca3af', width: 70, flexShrink: 0 }}>{entry.time}</span>
                <span style={{ color: entry.ok ? '#22c55e' : '#ef4444', width: 14 }}>{entry.ok ? '✓' : '✗'}</span>
                <span style={{ color: '#6b7280', width: 120, flexShrink: 0 }}>{entry.action}</span>
                <span>{entry.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vendors Tab — Catalog Browse, Tenant Vendor CRUD, Contacts, Addresses
// Uses SDK via server actions (./vendor-actions.ts) — no HTTP routes needed.
// ---------------------------------------------------------------------------

function VendorsTab({ cardStyle, btnStyle }: { cardStyle: React.CSSProperties; btnStyle: (v: 'primary' | 'danger' | 'secondary') => React.CSSProperties }) {
  const [tenantId, setTenantId] = useState('');
  const [selectedVendorId, setSelectedVendorId] = useState('');

  // Catalog
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogResults, setCatalogResults] = useState<any[] | null>(null);
  const [selectedCatalogVendor, setSelectedCatalogVendor] = useState<any | null>(null);
  const [industryTags, setIndustryTags] = useState<any[] | null>(null);

  // Tenant vendors
  const [tenantVendors, setTenantVendors] = useState<any[] | null>(null);
  const [cvName, setCvName] = useState('');
  const [cvVendorTypeId, setCvVendorTypeId] = useState('');
  const [cvAccountNumber, setCvAccountNumber] = useState('');
  const [cvPaymentTerms, setCvPaymentTerms] = useState('');
  const [cvCreditLimit, setCvCreditLimit] = useState('');
  const [cvNotes, setCvNotes] = useState('');
  const [adoptIds, setAdoptIds] = useState('');

  // Contacts
  const [contacts, setContacts] = useState<any[] | null>(null);
  const [ctName, setCtName] = useState('');
  const [ctEmail, setCtEmail] = useState('');
  const [ctPhone, setCtPhone] = useState('');
  const [ctTitle, setCtTitle] = useState('');
  const [ctIsPrimary, setCtIsPrimary] = useState(false);

  // Addresses
  const [addresses, setAddresses] = useState<any[] | null>(null);
  const [adType, setAdType] = useState('billing');
  const [adLabel, setAdLabel] = useState('');
  const [adStreet1, setAdStreet1] = useState('');
  const [adCity, setAdCity] = useState('');
  const [adState, setAdState] = useState('');
  const [adZip, setAdZip] = useState('');
  const [adCountry, setAdCountry] = useState('US');

  // Catalog submission
  const [subUserId, setSubUserId] = useState('');
  const [subEmail, setSubEmail] = useState('');
  const [subDescription, setSubDescription] = useState('');
  const [subTags, setSubTags] = useState('');
  const [submissionStatus, setSubmissionStatus] = useState<any | null>(null);

  // Activity log
  const [vendorLog, setVendorLog] = useState<Array<{ time: string; action: string; ok: boolean; detail: string }>>([]);

  const addLog = (action: string, ok: boolean, detail: string) => {
    setVendorLog(prev => [{ time: new Date().toLocaleTimeString(), action, ok, detail }, ...prev].slice(0, 30));
  };

  const inputStyle: React.CSSProperties = {
    padding: '0.4rem 0.6rem', borderRadius: 4, border: '1px solid #d1d5db',
    fontSize: '0.8rem', fontFamily: 'monospace', width: '100%', boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '0.75rem', color: '#6b7280', marginBottom: 2, display: 'block',
  };

  const sectionHeading: React.CSSProperties = {
    margin: 0, fontSize: '1rem', marginBottom: '0.75rem',
  };

  const codeBlock: React.CSSProperties = {
    background: '#f3f4f6', padding: '0.75rem', borderRadius: 6, fontSize: '0.75rem',
    fontFamily: 'monospace', whiteSpace: 'pre-wrap', overflowX: 'auto', lineHeight: 1.5,
  };

  // ── SDK-backed helpers (via server actions) ──

  const handleListCatalog = async () => {
    const opts: any = {};
    if (catalogSearch) opts.industry = catalogSearch;
    const res = await listCatalogVendors(Object.keys(opts).length ? opts : undefined);
    if (res.ok) {
      setCatalogResults(res.data);
      addLog('catalog.list', true, `${res.data.length} result(s)`);
    } else {
      addLog('catalog.list', false, res.error);
    }
  };

  const handleCatalogDetail = async (id: string) => {
    const res = await getCatalogVendor(id);
    if (res.ok) {
      setSelectedCatalogVendor(res.data);
      addLog('catalog.getById', true, `Loaded ${res.data.name || id}`);
    } else {
      addLog('catalog.getById', false, res.error);
    }
  };

  const handleListTags = async () => {
    const res = await listIndustryTags();
    if (res.ok) {
      setIndustryTags(res.data);
      addLog('catalog.listIndustryTags', true, `${res.data.length} tag(s)`);
    } else {
      addLog('catalog.listIndustryTags', false, res.error);
    }
  };

  const handleListVendors = async () => {
    if (!tenantId) { addLog('vendors.list', false, 'tenant_id is required'); return; }
    const res = await listVendors(tenantId);
    if (res.ok) {
      setTenantVendors(res.data);
      addLog('vendors.list', true, `${res.data.length} vendor(s)`);
    } else {
      addLog('vendors.list', false, res.error);
    }
  };

  const handleCreateVendor = async () => {
    if (!tenantId || !cvName || !cvVendorTypeId) { addLog('vendors.create', false, 'tenant_id, name, and vendor_type_id are required'); return; }
    const input: any = { name: cvName, vendor_type_id: cvVendorTypeId };
    if (cvAccountNumber) input.account_number = cvAccountNumber;
    if (cvPaymentTerms) input.payment_terms = cvPaymentTerms;
    if (cvCreditLimit) input.credit_limit = Number(cvCreditLimit);
    if (cvNotes) input.notes = cvNotes;
    const res = await createVendor(tenantId, input);
    if (res.ok) {
      addLog('vendors.create', true, `Created "${cvName}"`);
      handleListVendors();
    } else {
      addLog('vendors.create', false, res.error);
    }
  };

  const handleAdopt = async () => {
    if (!tenantId || !adoptIds.trim()) { addLog('vendors.adopt', false, 'tenant_id and catalog IDs are required'); return; }
    const ids = adoptIds.split(',').map(s => s.trim()).filter(Boolean);
    const res = await adoptVendors(tenantId, ids);
    if (res.ok) {
      addLog('vendors.adopt', true, `Adopted ${res.data.adopted?.length ?? 0}, skipped ${res.data.skipped ?? 0}`);
      handleListVendors();
    } else {
      addLog('vendors.adopt', false, res.error);
    }
  };

  const handleDeleteVendor = async (id: string) => {
    if (!tenantId) return;
    const res = await deleteVendor(tenantId, id);
    if (res.ok) {
      addLog('vendors.softDelete', true, `Soft-deleted ${id.slice(0, 8)}...`);
      handleListVendors();
    } else {
      addLog('vendors.softDelete', false, res.error);
    }
  };

  const handleListContacts = async () => {
    if (!tenantId || !selectedVendorId) { addLog('vendors.listContacts', false, 'tenant_id and vendor_id are required'); return; }
    const res = await listContacts(tenantId, selectedVendorId);
    if (res.ok) {
      setContacts(res.data);
      addLog('vendors.listContacts', true, `${res.data.length} contact(s)`);
    } else {
      addLog('vendors.listContacts', false, res.error);
    }
  };

  const handleCreateContact = async () => {
    if (!tenantId || !selectedVendorId || !ctName) { addLog('vendors.createContact', false, 'tenant_id, vendor_id, and name are required'); return; }
    const input: any = { name: ctName };
    if (ctEmail) input.email = ctEmail;
    if (ctPhone) input.phone = ctPhone;
    if (ctTitle) input.title = ctTitle;
    if (ctIsPrimary) input.is_primary = true;
    const res = await createContact(tenantId, selectedVendorId, input);
    if (res.ok) {
      addLog('vendors.createContact', true, `Created contact "${ctName}"`);
      handleListContacts();
    } else {
      addLog('vendors.createContact', false, res.error);
    }
  };

  const handleDeleteContact = async (contactId: string) => {
    if (!tenantId || !selectedVendorId) return;
    const res = await deleteContact(tenantId, selectedVendorId, contactId);
    if (res.ok) {
      addLog('vendors.deleteContact', true, `Deleted ${contactId.slice(0, 8)}...`);
      handleListContacts();
    } else {
      addLog('vendors.deleteContact', false, res.error);
    }
  };

  const handleListAddresses = async () => {
    if (!tenantId || !selectedVendorId) { addLog('vendors.listAddresses', false, 'tenant_id and vendor_id are required'); return; }
    const res = await listAddresses(tenantId, selectedVendorId);
    if (res.ok) {
      setAddresses(res.data);
      addLog('vendors.listAddresses', true, `${res.data.length} address(es)`);
    } else {
      addLog('vendors.listAddresses', false, res.error);
    }
  };

  const handleCreateAddress = async () => {
    if (!tenantId || !selectedVendorId || !adStreet1 || !adCity || !adState || !adZip) {
      addLog('vendors.createAddress', false, 'tenant_id, vendor_id, street1, city, state, and zip are required'); return;
    }
    const input: any = { address_type: adType, street1: adStreet1, city: adCity, state: adState, zip: adZip, country: adCountry };
    if (adLabel) input.label = adLabel;
    const res = await createAddress(tenantId, selectedVendorId, input);
    if (res.ok) {
      addLog('vendors.createAddress', true, `Created ${adType} address`);
      handleListAddresses();
    } else {
      addLog('vendors.createAddress', false, res.error);
    }
  };

  const handleDeleteAddress = async (addressId: string) => {
    if (!tenantId || !selectedVendorId) return;
    const res = await deleteAddress(tenantId, selectedVendorId, addressId);
    if (res.ok) {
      addLog('vendors.deleteAddress', true, `Deleted ${addressId.slice(0, 8)}...`);
      handleListAddresses();
    } else {
      addLog('vendors.deleteAddress', false, res.error);
    }
  };

  const handleSubmitToCatalog = async () => {
    if (!tenantId || !selectedVendorId || !subUserId || !subEmail) {
      addLog('vendors.submitToCatalog', false, 'tenant_id, vendor_id, user_id, and email are required'); return;
    }
    const submitter = { tenantId, userId: subUserId, email: subEmail };
    const input: any = {};
    if (subDescription) input.proposed_description = subDescription;
    if (subTags.trim()) input.proposed_industry_tags = subTags.split(',').map((s: string) => s.trim()).filter(Boolean);
    const res = await submitToCatalog(tenantId, selectedVendorId, submitter, Object.keys(input).length ? input : undefined);
    if (res.ok) {
      addLog('vendors.submitToCatalog', true, 'Submitted for catalog review');
    } else {
      addLog('vendors.submitToCatalog', false, res.error);
    }
  };

  const handleCheckSubmission = async () => {
    if (!tenantId || !selectedVendorId) { addLog('vendors.getSubmission', false, 'tenant_id and vendor_id are required'); return; }
    const res = await getSubmission(tenantId, selectedVendorId);
    if (res.ok) {
      setSubmissionStatus(res.data);
      addLog('vendors.getSubmission', true, `Status: ${res.data?.status || 'none'}`);
    } else {
      addLog('vendors.getSubmission', false, res.error);
    }
  };

  const handleWithdrawSubmission = async () => {
    if (!tenantId || !selectedVendorId) return;
    const res = await withdrawSubmission(tenantId, selectedVendorId);
    if (res.ok) {
      addLog('vendors.withdrawSubmission', true, 'Submission withdrawn');
      setSubmissionStatus(null);
    } else {
      addLog('vendors.withdrawSubmission', false, res.error);
    }
  };

  const submissionBadgeColor = (status: string) => {
    if (status === 'approved') return { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534' };
    if (status === 'rejected') return { bg: '#fef2f2', border: '#fecaca', text: '#991b1b' };
    if (status === 'pending') return { bg: '#fef3c7', border: '#fde68a', text: '#92400e' };
    if (status === 'withdrawn') return { bg: '#f3f4f6', border: '#e5e7eb', text: '#6b7280' };
    return { bg: '#f3f4f6', border: '#e5e7eb', text: '#374151' };
  };

  return (
    <div>
      {/* ── 1. Core Concepts ── */}
      <div style={cardStyle}>
        <h2 style={sectionHeading}>Core Concepts</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
          <div style={{ padding: '0.75rem', background: '#faf5ff', borderRadius: 6, border: '1px solid #e9d5ff' }}>
            <strong style={{ fontSize: '0.85rem' }}>Vendor Catalog</strong>
            <div style={{ fontSize: '0.8rem', marginTop: 4, color: '#6b21a8' }}>
              Platform-wide directory of known vendors. Read-only for tenants. Managed by platform admins.
              Used as the source of truth when tenants <strong>adopt</strong> vendors.
            </div>
            <div style={{ fontSize: '0.75rem', marginTop: 8, color: '#6b7280' }}>
              Think of it like an app store &mdash; browse, find what you need, adopt it into your tenant.
            </div>
          </div>
          <div style={{ padding: '0.75rem', background: '#eff6ff', borderRadius: 6, border: '1px solid #bfdbfe' }}>
            <strong style={{ fontSize: '0.85rem' }}>Tenant Vendors</strong>
            <div style={{ fontSize: '0.8rem', marginTop: 4, color: '#1e40af' }}>
              Tenant-scoped vendor records. Each tenant has their own copy with local data
              (account numbers, payment terms, credit limits, contacts, addresses).
              Can be <strong>custom</strong> (created from scratch) or <strong>adopted</strong> (copied from catalog).
            </div>
          </div>
          <div style={{ padding: '0.75rem', background: '#f0fdf4', borderRadius: 6, border: '1px solid #bbf7d0' }}>
            <strong style={{ fontSize: '0.85rem' }}>Adoption Flow</strong>
            <div style={{ fontSize: '0.8rem', marginTop: 4, color: '#166534' }}>
              When a tenant adopts a catalog vendor, the system copies the vendor's core data
              (name, description, tags) into a new tenant vendor record with <code style={{ fontSize: '0.75rem' }}>catalog_vendor_id</code> set.
              The tenant can then customize their copy freely.
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. Test Context ── */}
      <div style={cardStyle}>
        <h2 style={sectionHeading}>Test Context</h2>
        <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.75rem' }}>
          Set the tenant and vendor to use for operations below. Get your tenant_id from the Auth tab session info.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div>
            <label style={labelStyle}>tenant_id (required for tenant ops)</label>
            <input style={inputStyle} placeholder="uuid" value={tenantId} onChange={e => setTenantId(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>vendor_id (for contacts, addresses, submission)</label>
            <input style={inputStyle} placeholder="uuid" value={selectedVendorId} onChange={e => setSelectedVendorId(e.target.value)} />
          </div>
        </div>
      </div>

      {/* ── 3. Catalog Browser ── */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h2 style={{ margin: 0, fontSize: '1rem' }}>Catalog Browser</h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={handleListTags} style={btnStyle('secondary')}>Industry Tags</button>
            <button onClick={handleListCatalog} style={btnStyle('secondary')}>List Catalog</button>
          </div>
        </div>
        <div style={{ marginBottom: '0.75rem' }}>
          <label style={labelStyle}>Industry filter (optional &mdash; matches catalog.list({"{"} industry {"}"}))</label>
          <input style={inputStyle} placeholder="e.g. concrete, lumber" value={catalogSearch} onChange={e => setCatalogSearch(e.target.value)} />
        </div>

        {industryTags && (
          <div style={{ marginBottom: '0.75rem', padding: '0.5rem 0.75rem', background: '#f9fafb', borderRadius: 6, border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>Industry Tags ({industryTags.length})</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
              {industryTags.map((tag: any) => (
                <span
                  key={tag.id}
                  onClick={() => setCatalogSearch(tag.code)}
                  style={{ padding: '2px 8px', background: '#e0e7ff', color: '#3730a3', borderRadius: 12, fontSize: '0.7rem', cursor: 'pointer' }}
                  title={tag.default_label}
                >
                  {tag.code}
                </span>
              ))}
            </div>
          </div>
        )}

        {catalogResults && (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'auto', maxHeight: 300 }}>
            <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse', fontFamily: 'monospace' }}>
              <thead>
                <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                  <th style={{ padding: '0.4rem 0.6rem' }}>id</th>
                  <th style={{ padding: '0.4rem 0.6rem' }}>name</th>
                  <th style={{ padding: '0.4rem 0.6rem' }}>description</th>
                  <th style={{ padding: '0.4rem 0.6rem' }}>tags</th>
                  <th style={{ padding: '0.4rem 0.6rem' }}>active</th>
                  <th style={{ padding: '0.4rem 0.6rem' }}></th>
                </tr>
              </thead>
              <tbody>
                {catalogResults.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: '1rem', textAlign: 'center', color: '#9ca3af' }}>No catalog vendors found</td></tr>
                )}
                {catalogResults.map((cv: any, i: number) => (
                  <tr key={cv.id || i} style={{ borderTop: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '0.4rem 0.6rem', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis' }} title={cv.id}>{cv.id?.slice(0, 8)}...</td>
                    <td style={{ padding: '0.4rem 0.6rem', fontWeight: 600 }}>{cv.name}</td>
                    <td style={{ padding: '0.4rem 0.6rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{cv.description || '—'}</td>
                    <td style={{ padding: '0.4rem 0.6rem' }}>{Array.isArray(cv.tags) ? cv.tags.join(', ') : cv.tags || '—'}</td>
                    <td style={{ padding: '0.4rem 0.6rem' }}>{cv.is_active !== false ? '✅' : '❌'}</td>
                    <td style={{ padding: '0.4rem 0.6rem' }}>
                      <button onClick={() => handleCatalogDetail(cv.id)} style={{ ...btnStyle('secondary'), padding: '2px 8px', fontSize: '0.7rem' }}>Detail</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {selectedCatalogVendor && (
          <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#f9fafb', borderRadius: 6, border: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Catalog Detail: {selectedCatalogVendor.name}</div>
              <button onClick={() => setSelectedCatalogVendor(null)} style={{ ...btnStyle('secondary'), padding: '2px 8px', fontSize: '0.7rem' }}>Close</button>
            </div>
            <pre style={{ ...codeBlock, fontSize: '0.72rem' }}>{JSON.stringify(selectedCatalogVendor, null, 2)}</pre>
          </div>
        )}
      </div>

      {/* ── 4. Tenant Vendors ── */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h2 style={{ margin: 0, fontSize: '1rem' }}>Tenant Vendors</h2>
          <button onClick={handleListVendors} style={btnStyle('secondary')}>Fetch Vendors</button>
        </div>

        {/* Create custom vendor form */}
        <div style={{ padding: '0.75rem', background: '#f9fafb', borderRadius: 6, border: '1px solid #e5e7eb', marginBottom: '0.75rem' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem' }}>Create Custom Vendor</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <div>
              <label style={labelStyle}>name *</label>
              <input style={inputStyle} placeholder="Vendor name" value={cvName} onChange={e => setCvName(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>vendor_type_id</label>
              <input style={inputStyle} placeholder="uuid (optional)" value={cvVendorTypeId} onChange={e => setCvVendorTypeId(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>account_number</label>
              <input style={inputStyle} placeholder="Optional" value={cvAccountNumber} onChange={e => setCvAccountNumber(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>payment_terms</label>
              <input style={inputStyle} placeholder="e.g. Net 30" value={cvPaymentTerms} onChange={e => setCvPaymentTerms(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>credit_limit</label>
              <input style={inputStyle} type="number" placeholder="Optional" value={cvCreditLimit} onChange={e => setCvCreditLimit(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>notes</label>
              <input style={inputStyle} placeholder="Optional" value={cvNotes} onChange={e => setCvNotes(e.target.value)} />
            </div>
          </div>
          <div style={{ marginTop: '0.5rem' }}>
            <button onClick={handleCreateVendor} style={btnStyle('primary')}>Create Vendor</button>
          </div>
        </div>

        {/* Adopt from catalog form */}
        <div style={{ padding: '0.75rem', background: '#eff6ff', borderRadius: 6, border: '1px solid #bfdbfe', marginBottom: '0.75rem' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem' }}>Adopt from Catalog</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.5rem', alignItems: 'flex-end' }}>
            <div>
              <label style={labelStyle}>catalog_vendor_ids (comma-separated)</label>
              <input style={inputStyle} placeholder="uuid1, uuid2, ..." value={adoptIds} onChange={e => setAdoptIds(e.target.value)} />
            </div>
            <button onClick={handleAdopt} style={btnStyle('primary')}>Adopt</button>
          </div>
        </div>

        {/* Tenant vendor results table */}
        {tenantVendors && (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'auto', maxHeight: 300 }}>
            <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse', fontFamily: 'monospace' }}>
              <thead>
                <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                  <th style={{ padding: '0.4rem 0.6rem' }}>id</th>
                  <th style={{ padding: '0.4rem 0.6rem' }}>name</th>
                  <th style={{ padding: '0.4rem 0.6rem' }}>type</th>
                  <th style={{ padding: '0.4rem 0.6rem' }}>catalog</th>
                  <th style={{ padding: '0.4rem 0.6rem' }}>custom</th>
                  <th style={{ padding: '0.4rem 0.6rem' }}></th>
                </tr>
              </thead>
              <tbody>
                {tenantVendors.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: '1rem', textAlign: 'center', color: '#9ca3af' }}>No tenant vendors found</td></tr>
                )}
                {tenantVendors.map((tv: any, i: number) => (
                  <tr key={tv.id || i} style={{ borderTop: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '0.4rem 0.6rem', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis' }} title={tv.id}>
                      <span style={{ cursor: 'pointer', color: '#2563eb', textDecoration: 'underline' }} onClick={() => setSelectedVendorId(tv.id)}>{tv.id?.slice(0, 8)}...</span>
                    </td>
                    <td style={{ padding: '0.4rem 0.6rem', fontWeight: 600 }}>{tv.name}</td>
                    <td style={{ padding: '0.4rem 0.6rem' }}>{tv.vendor_type_id?.slice(0, 8) || '—'}</td>
                    <td style={{ padding: '0.4rem 0.6rem' }}>{tv.catalog_vendor_id ? tv.catalog_vendor_id.slice(0, 8) + '...' : '—'}</td>
                    <td style={{ padding: '0.4rem 0.6rem' }}>{tv.is_custom ? 'yes' : 'no'}</td>
                    <td style={{ padding: '0.4rem 0.6rem' }}>
                      <button onClick={() => handleDeleteVendor(tv.id)} style={{ ...btnStyle('danger'), padding: '2px 8px', fontSize: '0.7rem' }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 5. Contacts & Addresses ── */}
      <div style={cardStyle}>
        <h2 style={sectionHeading}>Contacts & Addresses</h2>
        {!selectedVendorId && (
          <div style={{ padding: '0.75rem', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 6, fontSize: '0.8rem', color: '#92400e' }}>
            Set a vendor_id in the Test Context above (or click a vendor ID in the table) to manage contacts and addresses.
          </div>
        )}

        {selectedVendorId && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {/* Contacts column */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Contacts</div>
                <button onClick={handleListContacts} style={{ ...btnStyle('secondary'), padding: '2px 8px', fontSize: '0.7rem' }}>Fetch</button>
              </div>

              {/* Create contact form */}
              <div style={{ padding: '0.5rem', background: '#f9fafb', borderRadius: 6, border: '1px solid #e5e7eb', marginBottom: '0.5rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                  <div>
                    <label style={labelStyle}>name *</label>
                    <input style={inputStyle} placeholder="Contact name" value={ctName} onChange={e => setCtName(e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>email *</label>
                    <input style={inputStyle} placeholder="email@example.com" value={ctEmail} onChange={e => setCtEmail(e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>phone</label>
                    <input style={inputStyle} placeholder="Optional" value={ctPhone} onChange={e => setCtPhone(e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>title</label>
                    <input style={inputStyle} placeholder="Optional" value={ctTitle} onChange={e => setCtTitle(e.target.value)} />
                  </div>
                </div>
                <div style={{ marginTop: '0.4rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input type="checkbox" checked={ctIsPrimary} onChange={e => setCtIsPrimary(e.target.checked)} /> is_primary
                  </label>
                  <button onClick={handleCreateContact} style={{ ...btnStyle('primary'), padding: '2px 8px', fontSize: '0.7rem' }}>Add Contact</button>
                </div>
              </div>

              {/* Contacts table */}
              {contacts && (
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'auto', maxHeight: 200 }}>
                  <table style={{ width: '100%', fontSize: '0.7rem', borderCollapse: 'collapse', fontFamily: 'monospace' }}>
                    <thead>
                      <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                        <th style={{ padding: '0.3rem 0.4rem' }}>name</th>
                        <th style={{ padding: '0.3rem 0.4rem' }}>email</th>
                        <th style={{ padding: '0.3rem 0.4rem' }}>primary</th>
                        <th style={{ padding: '0.3rem 0.4rem' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {contacts.length === 0 && (
                        <tr><td colSpan={4} style={{ padding: '0.5rem', textAlign: 'center', color: '#9ca3af' }}>No contacts</td></tr>
                      )}
                      {contacts.map((ct: any, i: number) => (
                        <tr key={ct.id || i} style={{ borderTop: '1px solid #e5e7eb' }}>
                          <td style={{ padding: '0.3rem 0.4rem' }}>{ct.name}</td>
                          <td style={{ padding: '0.3rem 0.4rem' }}>{ct.email}</td>
                          <td style={{ padding: '0.3rem 0.4rem' }}>{ct.is_primary ? '✅' : ''}</td>
                          <td style={{ padding: '0.3rem 0.4rem' }}>
                            <button onClick={() => handleDeleteContact(ct.id)} style={{ ...btnStyle('danger'), padding: '1px 6px', fontSize: '0.65rem' }}>Del</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Addresses column */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Addresses</div>
                <button onClick={handleListAddresses} style={{ ...btnStyle('secondary'), padding: '2px 8px', fontSize: '0.7rem' }}>Fetch</button>
              </div>

              {/* Create address form */}
              <div style={{ padding: '0.5rem', background: '#f9fafb', borderRadius: 6, border: '1px solid #e5e7eb', marginBottom: '0.5rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                  <div>
                    <label style={labelStyle}>address_type</label>
                    <select style={{ ...inputStyle, fontFamily: 'system-ui' }} value={adType} onChange={e => setAdType(e.target.value)}>
                      <option value="billing">billing</option>
                      <option value="shipping">shipping</option>
                      <option value="remittance">remittance</option>
                      <option value="other">other</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>label</label>
                    <input style={inputStyle} placeholder="e.g. HQ, Warehouse" value={adLabel} onChange={e => setAdLabel(e.target.value)} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelStyle}>street1 *</label>
                    <input style={inputStyle} placeholder="Street address" value={adStreet1} onChange={e => setAdStreet1(e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>city *</label>
                    <input style={inputStyle} placeholder="City" value={adCity} onChange={e => setAdCity(e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>state *</label>
                    <input style={inputStyle} placeholder="State" value={adState} onChange={e => setAdState(e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>zip *</label>
                    <input style={inputStyle} placeholder="Zip code" value={adZip} onChange={e => setAdZip(e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>country</label>
                    <input style={inputStyle} placeholder="US" value={adCountry} onChange={e => setAdCountry(e.target.value)} />
                  </div>
                </div>
                <div style={{ marginTop: '0.4rem' }}>
                  <button onClick={handleCreateAddress} style={{ ...btnStyle('primary'), padding: '2px 8px', fontSize: '0.7rem' }}>Add Address</button>
                </div>
              </div>

              {/* Addresses table */}
              {addresses && (
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'auto', maxHeight: 200 }}>
                  <table style={{ width: '100%', fontSize: '0.7rem', borderCollapse: 'collapse', fontFamily: 'monospace' }}>
                    <thead>
                      <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                        <th style={{ padding: '0.3rem 0.4rem' }}>type</th>
                        <th style={{ padding: '0.3rem 0.4rem' }}>label</th>
                        <th style={{ padding: '0.3rem 0.4rem' }}>city, state</th>
                        <th style={{ padding: '0.3rem 0.4rem' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {addresses.length === 0 && (
                        <tr><td colSpan={4} style={{ padding: '0.5rem', textAlign: 'center', color: '#9ca3af' }}>No addresses</td></tr>
                      )}
                      {addresses.map((ad: any, i: number) => (
                        <tr key={ad.id || i} style={{ borderTop: '1px solid #e5e7eb' }}>
                          <td style={{ padding: '0.3rem 0.4rem' }}>{ad.address_type}</td>
                          <td style={{ padding: '0.3rem 0.4rem' }}>{ad.label || '—'}</td>
                          <td style={{ padding: '0.3rem 0.4rem' }}>{ad.city}, {ad.state}</td>
                          <td style={{ padding: '0.3rem 0.4rem' }}>
                            <button onClick={() => handleDeleteAddress(ad.id)} style={{ ...btnStyle('danger'), padding: '1px 6px', fontSize: '0.65rem' }}>Del</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── 6. Catalog Submission ── */}
      <div style={cardStyle}>
        <h2 style={sectionHeading}>Catalog Submission</h2>
        <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.75rem' }}>
          Submit a tenant vendor to the platform catalog for review. Requires a vendor_id set above.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          {/* Submit form */}
          <div style={{ padding: '0.75rem', background: '#f9fafb', borderRadius: 6, border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem' }}>Submit for Review</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <div>
                <label style={labelStyle}>user_id *</label>
                <input style={inputStyle} placeholder="uuid of submitting user" value={subUserId} onChange={e => setSubUserId(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>email *</label>
                <input style={inputStyle} placeholder="submitter email" value={subEmail} onChange={e => setSubEmail(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>proposed_description</label>
                <input style={inputStyle} placeholder="Why this vendor should be in the catalog" value={subDescription} onChange={e => setSubDescription(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>proposed_industry_tags (comma-separated)</label>
                <input style={inputStyle} placeholder="e.g. concrete, lumber" value={subTags} onChange={e => setSubTags(e.target.value)} />
              </div>
              <button onClick={handleSubmitToCatalog} disabled={!selectedVendorId} style={{ ...btnStyle('primary'), ...(selectedVendorId ? {} : { opacity: 0.5, cursor: 'not-allowed' }) }}>Submit to Catalog</button>
            </div>
          </div>

          {/* Check / withdraw status */}
          <div style={{ padding: '0.75rem', background: '#f9fafb', borderRadius: 6, border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem' }}>Submission Status</div>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <button onClick={handleCheckSubmission} disabled={!selectedVendorId} style={{ ...btnStyle('secondary'), ...(selectedVendorId ? {} : { opacity: 0.5, cursor: 'not-allowed' }) }}>Check Status</button>
              <button onClick={handleWithdrawSubmission} disabled={!selectedVendorId} style={{ ...btnStyle('danger'), ...(selectedVendorId ? {} : { opacity: 0.5, cursor: 'not-allowed' }) }}>Withdraw</button>
            </div>
            {submissionStatus && (() => {
              const colors = submissionBadgeColor(submissionStatus.status);
              return (
                <div style={{ padding: '0.5rem 0.75rem', background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, fontSize: '0.8rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <span style={{ fontWeight: 600, color: colors.text }}>{(submissionStatus.status || 'unknown').toUpperCase()}</span>
                  </div>
                  <pre style={{ ...codeBlock, fontSize: '0.7rem', margin: 0 }}>{JSON.stringify(submissionStatus, null, 2)}</pre>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* ── 7. SDK Examples ── */}
      <div style={cardStyle}>
        <h2 style={sectionHeading}>SDK Client Setup: Reads vs Writes</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div style={{ padding: '0.75rem', background: '#f0fdf4', borderRadius: 6, border: '1px solid #bbf7d0' }}>
            <strong style={{ fontSize: '0.85rem' }}>createVendorCatalogClient() &mdash; read-only</strong>
            <pre style={{ ...codeBlock, marginTop: 8, fontSize: '0.72rem', background: '#ecfdf5' }}>{`import { createVendorCatalogClient } from
  '@rocketmanv9/chassis/vendors';

const catalog = createVendorCatalogClient();

// Browse catalog
const vendors = await catalog.list();
const filtered = await catalog.list({ industry: 'concrete' });
const detail = await catalog.getById(catalogVendorId);
const tags = await catalog.listIndustryTags();

// Catalog contacts & addresses (read-only)
const contacts = await catalog.listContacts(catalogVendorId);
const addresses = await catalog.listAddresses(catalogVendorId);`}</pre>
            <div style={{ fontSize: '0.72rem', color: '#166534', marginTop: 6 }}>
              No tenant context needed. Talks directly to the GV Supabase. Sync constructor, safe to reuse across requests.
            </div>
          </div>
          <div style={{ padding: '0.75rem', background: '#eff6ff', borderRadius: 6, border: '1px solid #bfdbfe' }}>
            <strong style={{ fontSize: '0.85rem' }}>createTenantVendorClient(tenantId) &mdash; read + write</strong>
            <pre style={{ ...codeBlock, marginTop: 8, fontSize: '0.72rem', background: '#eff6ff' }}>{`import { createTenantVendorClient } from
  '@rocketmanv9/chassis/vendors';

// Async — sets RLS tenant context
const client = await createTenantVendorClient(tenantId);

// CRUD
const myVendors = await client.list();
await client.create({ name: 'Acme', vendor_type_id: termId });
await client.update(vendorId, { payment_terms: 'Net 30' });
await client.softDelete(vendorId);

// Adopt from catalog
const result = await client.adopt([catalogVendorId]);

// Contacts & addresses
await client.createContact(vendorId, { name, email });
await client.createAddress(vendorId, {
  address_type: 'billing', street1, city, state, zip
});

// Submit to catalog
await client.submitToCatalog(vendorId, submitter);
const sub = await client.getSubmission(vendorId);`}</pre>
            <div style={{ fontSize: '0.72rem', color: '#1e40af', marginTop: 6 }}>
              Sets <code style={{ fontSize: '0.68rem' }}>app.current_tenant_id</code> via setRLSContext. Creates a fresh Supabase client per call for concurrency safety.
            </div>
          </div>
        </div>
        <div style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 6, fontSize: '0.78rem', color: '#92400e' }}>
          Write operations (create, update, softDelete, adopt, contacts, addresses, submissions) will fail if you use createVendorCatalogClient(). Always use createTenantVendorClient(tenantId) for mutations.
        </div>
      </div>

      {/* ── 8. Common Mistakes ── */}
      <div style={cardStyle}>
        <h2 style={sectionHeading}>Common Mistakes</h2>
        <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {[
            'Do NOT confuse catalog vendors with tenant vendors. The catalog is read-only; tenant vendors are your copies.',
            'Adopt copies data from the catalog into your tenant. Editing the tenant vendor does NOT update the catalog entry.',
            'vendor_type_id must reference a valid GV term. Fetch vendor types from the Global Values tab first.',
            'createTenantVendorClient() is async — it sets RLS context. Always await it before calling methods.',
            'Deleting a tenant vendor is a soft-delete (sets deleted_at). The record still exists in the database.',
            'Contacts and addresses belong to a specific tenant vendor. You need the vendor_id to manage them.',
            'Catalog submission can be withdrawn while pending. Once approved or rejected, it cannot be changed by the tenant.',
            'Use createTenantVendorClient(tenantId) for all write operations. The catalog client is read-only.',
          ].map((tip, i) => (
            <div key={i} style={{ padding: '0.4rem 0.6rem', background: i % 2 === 0 ? '#fffbeb' : '#fff', borderRadius: 4, border: '1px solid #fde68a' }}>
              {tip}
            </div>
          ))}
        </div>
      </div>

      {/* ── 9. Activity Log ── */}
      {vendorLog.length > 0 && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h2 style={{ margin: 0, fontSize: '1rem' }}>Activity Log</h2>
            <button onClick={() => setVendorLog([])} style={btnStyle('secondary')}>Clear</button>
          </div>
          <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', maxHeight: 200, overflowY: 'auto' }}>
            {vendorLog.map((entry, i) => (
              <div key={i} style={{ padding: '0.3rem 0', borderBottom: '1px solid #f3f4f6', display: 'flex', gap: '0.5rem' }}>
                <span style={{ color: '#9ca3af', width: 70, flexShrink: 0 }}>{entry.time}</span>
                <span style={{ color: entry.ok ? '#22c55e' : '#ef4444', width: 14 }}>{entry.ok ? '✓' : '✗'}</span>
                <span style={{ color: '#6b7280', width: 120, flexShrink: 0 }}>{entry.action}</span>
                <span>{entry.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
