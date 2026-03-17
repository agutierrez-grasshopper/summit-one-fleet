import { z } from 'zod';
import { createSessionReadRoute, createSessionWriteRoute } from '@rocketmanv9/chassis/nextjs';
import { AppError } from '@rocketmanv9/chassis/errors';
import { createTenantServiceClient } from '@rocketmanv9/chassis/supabase';

const SERVICE_NAME = process.env.INTERNAL_JWT_ISSUER || 'summit-one-fleet';

const CreateGeofenceSchema = z.object({
  name: z.string().min(1),
  shape: z.enum(['circle', 'polygon', 'rectangle']),
  coordinates: z.any(),
  radius: z.number().optional(),
  active: z.boolean().optional(),
});

export const GET = createSessionReadRoute(async ({ req, session }) => {
  const supabase = await createTenantServiceClient({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    tenantId: session.tenantId,
  });

  const url = new URL(req.url);
  const active = url.searchParams.get('active');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);

  let query = supabase.from('geofences').select('*', { count: 'exact' });
  if (active !== null) query = query.eq('active', active === 'true');

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw AppError.internal(error.message);
  return Response.json({ data, count, limit, offset });
}, { serviceName: SERVICE_NAME });

export const POST = createSessionWriteRoute(async ({ req, log, supabase, idempotencyKey }) => {
  const body = CreateGeofenceSchema.parse(await req.json());

  const { data, error } = await supabase
    .from('geofences')
    .upsert({
      name: body.name,
      shape: body.shape,
      coordinates: body.coordinates,
      radius: body.radius,
      active: body.active ?? true,
    })
    .select()
    .single();

  if (error) throw AppError.internal(error.message);
  log.info('geofence.created', { geofenceId: data.id });

  return {
    data,
    status: 201,
    events: [],
  };
}, { serviceName: SERVICE_NAME, scope: 'POST /api/geofences' });
