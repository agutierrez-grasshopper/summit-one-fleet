// supabase/functions/sso-login/index.ts
//
// Edge Function: SSO Login
//
// Cross-project SSO session minting. Receives a core_token from Summit One Core,
// validates it against Core's Supabase project, creates/fetches a local user,
// and mints a local Supabase session.
//
// Flow:
// 1. Client redirects from Core with ?core_token=<ticket>
// 2. This function validates the ticket against Core's exchange endpoint
// 3. Creates or updates the local user in this Supabase project
// 4. Mints a local Supabase session (access + refresh tokens)
// 5. Redirects client to the app with session cookies set

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CORE_EXCHANGE_URL = Deno.env.get('CORE_EXCHANGE_URL')!;
const CORE_ANON_KEY = Deno.env.get('CORE_ANON_KEY')!;
const APP_URL = Deno.env.get('APP_URL') || Deno.env.get('NEXT_PUBLIC_APP_URL') || '';
const CORE_SSO_SECRET = Deno.env.get('CORE_SSO_SECRET');

interface CoreExchangeResponse {
  user_id: string;
  email: string;
  tenant_id: string;
  role: string;
  name?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  // Only accept POST (from API route) or GET (redirect flow)
  const url = new URL(req.url);

  // Extract core_token from query params (GET) or body (POST)
  let coreToken: string | null = null;
  let redirectTo = '/';

  if (req.method === 'GET') {
    coreToken = url.searchParams.get('core_token');
    redirectTo = url.searchParams.get('redirect_to') || '/';
  } else if (req.method === 'POST') {
    try {
      const body = await req.json();
      coreToken = body.core_token;
      redirectTo = body.redirect_to || '/';
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } else {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!coreToken) {
    return new Response(JSON.stringify({ error: 'Missing core_token' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // 1. Exchange the core_token with Summit One Core
    const exchangeHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'apikey': CORE_ANON_KEY,
    };

    if (CORE_SSO_SECRET) {
      exchangeHeaders['x-sso-secret'] = CORE_SSO_SECRET;
    }

    const exchangeResponse = await fetch(CORE_EXCHANGE_URL, {
      method: 'POST',
      headers: exchangeHeaders,
      body: JSON.stringify({ ticket: coreToken }),
    });

    if (!exchangeResponse.ok) {
      const errorText = await exchangeResponse.text().catch(() => 'Exchange failed');
      console.error('Core exchange failed:', exchangeResponse.status, errorText);
      return new Response(JSON.stringify({ error: 'SSO exchange failed', detail: errorText }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const coreUser: CoreExchangeResponse = await exchangeResponse.json();

    // 2. Create or update local user in this Supabase project
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Check if user already exists
    const { data: existingUser } = await supabase.auth.admin.getUserById(coreUser.user_id);

    if (existingUser?.user) {
      // Update existing user's metadata
      await supabase.auth.admin.updateUserById(coreUser.user_id, {
        email: coreUser.email,
        app_metadata: {
          tenant_id: coreUser.tenant_id,
          role: coreUser.role,
          ...coreUser.app_metadata,
        },
        user_metadata: {
          full_name: coreUser.name,
          ...coreUser.user_metadata,
        },
      });
    } else {
      // Create new local user with the same UUID as Core
      const { error: createError } = await supabase.auth.admin.createUser({
        id: coreUser.user_id,
        email: coreUser.email,
        email_confirm: true,
        app_metadata: {
          tenant_id: coreUser.tenant_id,
          role: coreUser.role,
          ...coreUser.app_metadata,
        },
        user_metadata: {
          full_name: coreUser.name,
          ...coreUser.user_metadata,
        },
      });

      if (createError) {
        console.error('Failed to create local user:', createError);
        return new Response(JSON.stringify({ error: 'Failed to create local user' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // 3. Generate a session for the local user
    const { data: sessionData, error: sessionError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: coreUser.email,
    });

    if (sessionError || !sessionData) {
      console.error('Failed to generate session:', sessionError);
      return new Response(JSON.stringify({ error: 'Failed to mint session' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 4. Record SSO token for audit/idempotency
    await supabase.from('sso_tokens').upsert({
      token: coreToken,
      user_id: coreUser.user_id,
      email: coreUser.email,
      tenant_id: coreUser.tenant_id,
      role: coreUser.role,
      name: coreUser.name,
      expires_at: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
      used: true,
    });

    // 5. Return session tokens or redirect
    if (req.method === 'POST') {
      return new Response(
        JSON.stringify({
          user_id: coreUser.user_id,
          email: coreUser.email,
          tenant_id: coreUser.tenant_id,
          role: coreUser.role,
          verification_url: sessionData.properties?.hashed_token
            ? `${SUPABASE_URL}/auth/v1/verify?token=${sessionData.properties.hashed_token}&type=magiclink`
            : null,
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    }

    // GET: redirect to verification URL which will set session cookies
    if (sessionData.properties?.hashed_token) {
      const verifyUrl = `${SUPABASE_URL}/auth/v1/verify?token=${sessionData.properties.hashed_token}&type=magiclink&redirect_to=${encodeURIComponent(APP_URL + redirectTo)}`;
      return Response.redirect(verifyUrl, 302);
    }

    // Fallback: redirect to app
    return Response.redirect(`${APP_URL}${redirectTo}`, 302);
  } catch (err) {
    console.error('SSO login error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal error', detail: err instanceof Error ? err.message : 'Unknown' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});
