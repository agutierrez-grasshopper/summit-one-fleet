import { z } from 'zod';
import { createSessionReadRoute, createSessionWriteRoute } from '@rocketmanv9/chassis/nextjs';
import { AppError } from '@rocketmanv9/chassis/errors';
import { createTenantServiceClient } from '@rocketmanv9/chassis/supabase';

const SERVICE_NAME = process.env.INTERNAL_JWT_ISSUER || 'summit-one-fleet';

const CreateAssetSchema = z.object({
  asset_class: z.enum(['vehicle', 'trailer', 'equipment']),
  status: z.enum(['active', 'maintenance', 'down', 'retired', 'pending']).optional(),
  name: z.string().optional(),
  vin: z.string().optional(),
  serial_number: z.string().optional(),
  license_plate: z.string().optional(),
  year: z.string().optional(),
  make: z.string().optional(),
  model: z.string().optional(),
});

export const GET = createSessionReadRoute(async ({ req, session }) => {
  const supabase = await createTenantServiceClient({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    tenantId: session.tenantId,
  });

  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const asset_class = url.searchParams.get('asset_class');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);

  let query = supabase.from('assets').select('*', { count: 'exact' });

  if (status) query = query.eq('status', status);
  if (asset_class) query = query.eq('asset_class', asset_class);

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw AppError.internal(error.message);

  return Response.json({ data, count, limit, offset });
}, { serviceName: SERVICE_NAME });

export const POST = createSessionWriteRoute(async ({ req, log, supabase, idempotencyKey }) => {
  const body = CreateAssetSchema.parse(await req.json());

  const { data, error } = await supabase
    .from('assets')
    .upsert({
      asset_class: body.asset_class,
      status: body.status || 'pending',
      name: body.name,
      vin: body.vin,
      serial_number: body.serial_number,
      license_plate: body.license_plate,
      year: body.year,
      make: body.make,
      model: body.model,
    })
    .select()
    .single();

  if (error) throw AppError.internal(error.message);

  log.info('asset.created', { assetId: data.id });

  return {
    data,
    status: 201,
    events: [{
      event_name: 'fleet.asset.created',
      payload: data,
      last_event_id: idempotencyKey,
    }],
  };
}, { serviceName: SERVICE_NAME, scope: 'POST /api/assets' });
