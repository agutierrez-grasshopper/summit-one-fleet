import { createSessionReadRoute } from '@rocketmanv9/chassis/nextjs';
import { AppError } from '@rocketmanv9/chassis/errors';
import { createTenantServiceClient } from '@rocketmanv9/chassis/supabase';

const SERVICE_NAME = process.env.INTERNAL_JWT_ISSUER || 'summit-one-fleet';

export const GET = createSessionReadRoute(async ({ req, session }) => {
  const supabase = await createTenantServiceClient({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    tenantId: session.tenantId,
  });

  const url = new URL(req.url);
  const asset_id = url.searchParams.get('asset_id');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500);

  let query = supabase.from('telemetry_data').select('*', { count: 'exact' });
  if (asset_id) query = query.eq('asset_id', asset_id);

  const { data, error, count } = await query
    .order('recorded_at', { ascending: false })
    .limit(limit);

  if (error) throw AppError.internal(error.message);
  return Response.json({ data, count });
}, { serviceName: SERVICE_NAME });
