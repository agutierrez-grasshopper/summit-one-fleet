import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
} from '@rocketmanv9/chassis/auth';
import { loadConfig } from '@rocketmanv9/chassis/config';

/**
 * GET|POST /api/auth/logout — clear session cookies and return Core login URL.
 */
async function handleLogout() {
  const cookieStore = await cookies();
  const config = loadConfig();

  // Clear both session cookies
  cookieStore.set(ACCESS_TOKEN_COOKIE, '', { maxAge: 0, path: '/' });
  cookieStore.set(REFRESH_TOKEN_COOKIE, '', { maxAge: 0, path: '/' });

  return NextResponse.json({
    loggedOut: true,
    redirectTo: config.NEXT_PUBLIC_CORE_APP_URL,
  });
}

export async function GET() {
  return handleLogout();
}

export async function POST() {
  return handleLogout();
}
