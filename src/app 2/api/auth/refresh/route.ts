import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  verifyRefreshToken,
  mintSessionTokens,
  accessTokenCookieConfig,
  refreshTokenCookieConfig,
  REFRESH_TOKEN_COOKIE,
} from '@rocketmanv9/chassis/auth';

/**
 * POST /api/auth/refresh — verify the refresh token and mint a fresh pair.
 *
 * The refresh token includes full user claims (app_metadata, user_metadata),
 * so no need to read the expired access token.
 */
export async function POST() {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;

  if (!refreshToken) {
    return NextResponse.json({ error: 'No refresh token' }, { status: 401 });
  }

  try {
    // Verify the refresh token — contains full user claims
    const claims = await verifyRefreshToken(refreshToken);

    // Mint new pair from the refresh token's claims
    const { accessToken: newAccess, refreshToken: newRefresh } = await mintSessionTokens({
      userId: claims.sub,
      tenantId: claims.app_metadata?.tenant_id ?? null,
      email: claims.user_metadata?.email ?? claims.email ?? '',
      name: claims.user_metadata?.full_name ?? '',
      role: claims.app_metadata?.role ?? 'authenticated',
      isDeveloper: claims.app_metadata?.is_developer === true,
    });

    const accessCfg = accessTokenCookieConfig(newAccess);
    const refreshCfg = refreshTokenCookieConfig(newRefresh);

    cookieStore.set(accessCfg.name, accessCfg.value, accessCfg);
    cookieStore.set(refreshCfg.name, refreshCfg.value, refreshCfg);

    return NextResponse.json({ refreshed: true });
  } catch {
    return NextResponse.json({ error: 'Invalid refresh token' }, { status: 401 });
  }
}
