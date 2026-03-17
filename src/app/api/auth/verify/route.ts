import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  verifySessionToken,
  ACCESS_TOKEN_COOKIE,
} from '@rocketmanv9/chassis/auth';

/**
 * GET /api/auth/verify — verify the current access token is valid.
 *
 * Returns { valid: true, claims: { ... } } if the token is valid,
 * or { valid: false } with 401 if not.
 */
export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;

  if (!token) {
    return NextResponse.json({ valid: false }, { status: 401 });
  }

  try {
    const claims = await verifySessionToken(token);

    return NextResponse.json({
      valid: true,
      claims: {
        sub: claims.sub,
        email: claims.email,
        tenantId: claims.app_metadata?.tenant_id ?? null,
        role: claims.app_metadata?.role ?? 'authenticated',
        exp: claims.exp,
        iat: claims.iat,
      },
    });
  } catch {
    return NextResponse.json({ valid: false }, { status: 401 });
  }
}
