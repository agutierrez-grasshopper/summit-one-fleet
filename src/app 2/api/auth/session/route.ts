import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  verifySessionToken,
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
} from '@rocketmanv9/chassis/auth';

/**
 * GET /api/auth/session — return the current user context from the access token.
 * DELETE /api/auth/session — clear the session (alias for logout).
 */
export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;

  if (!token) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  try {
    const claims = await verifySessionToken(token);

    return NextResponse.json({
      authenticated: true,
      userId: claims.sub,
      email: claims.email,
      tenantId: claims.app_metadata?.tenant_id ?? null,
      name: claims.user_metadata?.full_name ?? '',
      role: claims.app_metadata?.role ?? 'authenticated',
      isDeveloper: claims.app_metadata?.is_developer === true,
    });
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.set(ACCESS_TOKEN_COOKIE, '', { maxAge: 0, path: '/' });
  cookieStore.set(REFRESH_TOKEN_COOKIE, '', { maxAge: 0, path: '/' });

  return NextResponse.json({ cleared: true });
}
