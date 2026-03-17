import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  exchangeTicketWithCore,
  mintSessionTokens,
  accessTokenCookieConfig,
  refreshTokenCookieConfig,
} from '@rocketmanv9/chassis/auth';

/**
 * SSO callback — Core redirects here with a one-time ticket.
 *
 * Flow: Core → /auth/callback?ticket=XXX → exchange ticket → mint JWTs → set cookies → /dashboard
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ticket = searchParams.get('ticket');
  const targetOrg = searchParams.get('target_org');
  const targetService = searchParams.get('target_service');

  if (!ticket) {
    return NextResponse.redirect(new URL('/error?code=missing_ticket', request.url));
  }

  try {
    // 1. Exchange ticket with Core for user identity
    const user = await exchangeTicketWithCore({
      ticket,
      targetOrg,
      targetService: targetService || process.env.INTERNAL_JWT_ISSUER || undefined,
      forwardHeaders: {
        'x-forwarded-for': request.headers.get('x-forwarded-for') || 'unknown',
        'user-agent': request.headers.get('user-agent') || 'unknown',
      },
    });

    // 2. Mint access + refresh tokens signed with SUPABASE_JWT_SECRET
    const { accessToken, refreshToken } = await mintSessionTokens(user);

    // 3. Set httpOnly cookies
    const cookieStore = await cookies();
    const accessCfg = accessTokenCookieConfig(accessToken);
    const refreshCfg = refreshTokenCookieConfig(refreshToken);

    cookieStore.set(accessCfg.name, accessCfg.value, accessCfg);
    cookieStore.set(refreshCfg.name, refreshCfg.value, refreshCfg);

    // 4. Redirect to dashboard
    return NextResponse.redirect(new URL('/dashboard', request.url));
  } catch (error) {
    console.error('[Auth Callback] Exchange failed:', error);
    return NextResponse.redirect(new URL('/error?code=exchange_failed', request.url));
  }
}
