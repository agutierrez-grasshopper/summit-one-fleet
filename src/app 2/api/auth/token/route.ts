import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ACCESS_TOKEN_COOKIE } from '@rocketmanv9/chassis/auth';

/**
 * GET /api/auth/token — returns the access token from the httpOnly cookie.
 *
 * Client-side code calls this to get the token for API requests.
 */
export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;

  if (!token) {
    return NextResponse.json({ error: 'No session' }, { status: 401 });
  }

  return NextResponse.json({ access_token: token });
}
