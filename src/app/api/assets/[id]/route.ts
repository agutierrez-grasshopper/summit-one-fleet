import { z } from 'zod';
import { createSessionReadRoute, createSessionWriteRoute } from '@rocketmanv9/chassis/nextjs';
import { AppError } from '@rocketmanv9/chassis/errors';

const SERVICE_NAME = process.env.INTERNAL_JWT_ISSUER || 'summit-one-fleet';

const UpdateAssetSchema = z.object({
  asset_class: z.enum(['vehicle', 'trailer', 'equipment']).optional(),
  status: z.enum(['active', 'maintenance', 'down', 'retired', 'pending']).optional(),
  name: z.string().optional(),
  vin: z.string().optional(),
  serial_number: z.string().optional(),
  license_plate: z.string().optional(),
  year: z.string().optional(),
  make: z.string().optional(),
  model: z.string().optional(),
});

export const GET = createSessionReadRoute(async ({ req, supabase }) => {
  const id = req.url.split('/assets/')[1]?.split('?')[0];
  if (!id) throw AppError.badRequest('Missing asset ID');

  const { data, error } = await supabase
    .from('assets')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw AppError.notFound('Asset not found');

  return Response.json({ data });
}, { serviceName: SERVICE_NAME });

export const PATCH = createSessionWriteRoute(async ({ req, log, supabase, idempotencyKey }) => {
  const id = req.url.split('/assets/')[1]?.split('?')[0];
  if (!id) throw AppError.badRequest('Missing asset ID');

  const body = UpdateAssetSchema.parse(await req.json());

  const { data, error } = await supabase
    .from('assets')
    .update(body)
    .eq('id', id)
    .select()
    .single();

  if (error) throw AppError.internal(error.message);

  log.info('asset.updated', { assetId: data.id });

  return {
    data,
    status: 200,
    events: [{
      event_name: 'fleet.asset.updated',
      payload: data,
      last_event_id: idempotencyKey,
    }],
  };
}, { serviceName: SERVICE_NAME, scope: 'PATCH /api/assets/:id' });
