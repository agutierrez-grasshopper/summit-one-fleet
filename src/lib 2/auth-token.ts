/**
 * Client-side auth token manager.
 *
 * Caches the access token in memory and auto-refreshes 5 minutes before expiry.
 * Usage: const token = await getAuthToken();
 */

let cachedToken: string | null = null;
let expiresAt = 0;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

/** Margin before expiry to trigger refresh (5 minutes). */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/**
 * Returns a valid access token, fetching or refreshing as needed.
 */
export async function getAuthToken(): Promise<string | null> {
  if (cachedToken && Date.now() < expiresAt - REFRESH_MARGIN_MS) {
    return cachedToken;
  }

  return fetchToken();
}

async function fetchToken(): Promise<string | null> {
  try {
    const res = await fetch('/api/auth/token', { credentials: 'include' });

    if (!res.ok) {
      clearCache();
      return null;
    }

    const { access_token } = await res.json();
    if (!access_token) {
      clearCache();
      return null;
    }

    // Decode exp from JWT payload (middle segment)
    const payload = JSON.parse(atob(access_token.split('.')[1]));
    const expMs = payload.exp * 1000;

    cachedToken = access_token;
    expiresAt = expMs;

    // Schedule auto-refresh 5 minutes before expiry
    scheduleRefresh(expMs);

    return cachedToken;
  } catch {
    clearCache();
    return null;
  }
}

function scheduleRefresh(expMs: number) {
  if (refreshTimer) clearTimeout(refreshTimer);

  const refreshAt = expMs - REFRESH_MARGIN_MS - Date.now();
  if (refreshAt <= 0) return;

  refreshTimer = setTimeout(async () => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });

      if (res.ok) {
        await fetchToken(); // Re-fetch the new access token
      } else {
        clearCache();
      }
    } catch {
      clearCache();
    }
  }, refreshAt);
}

function clearCache() {
  cachedToken = null;
  expiresAt = 0;
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

/**
 * Force-clear the cached token (call on logout).
 */
export function clearAuthToken() {
  clearCache();
}
