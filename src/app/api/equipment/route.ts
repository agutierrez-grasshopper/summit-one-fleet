import { z } from 'zod';
import { createSessionReadRoute, createSessionWriteRoute } from '@rocketmanv9/chassis/nextjs';
import { AppError } from '@rocketmanv9/chassis/errors';

const SERVICE_NAME = process.env.INTERNAL_JWT_ISSUER || 'summit-one-fleet';

const CreateEquipmentSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.string().optional(),
  status: z.string().optional(),
  serial_number: z.string().optional(),
  model: z.string().optional(),
  manufacturer: z.string().optional(),
  purchase_date: z.string().optional(),
  warranty_expiration: z.string().optional(),
  notes: z.string().optional(),
});

export const GET = createSessionReadRoute(async ({ req, supabase }) => {
  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const type = url.searchParams.get('type');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);

  let query = supabase.from('equipment').select('*', { count: 'exact' });

  if (status) query = query.eq('status', status);
  if (type) query = query.eq('type', type);

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw AppError.internal(error.message);

  return Response.json({ data, count, limit, offset });
}, { serviceName: SERVICE_NAME });

export const POST = createSessionWriteRoute(async ({ req, log, supabase, idempotencyKey }) => {
  const body = CreateEquipmentSchema.parse(await req.json());

  const { data, error } = await supabase
    .from('equipment')
    .upsert({
      name: body.name,
      description: body.description,
      type: body.type,
      status: body.status,
      serial_number: body.serial_number,
      model: body.model,
      manufacturer: body.manufacturer,
      purchase_date: body.purchase_date,
      warranty_expiration: body.warranty_expiration,
      notes: body.notes,
    })
    .select()
    .single();

  if (error) throw AppError.internal(error.message);

  log.info('equipment.created', { equipmentId: data.id });

  return {
    data,
    status: 201,
    events: [{
      event_name: 'fleet.equipment.created',
      payload: data,
      last_event_id: idempotencyKey,
    }],
  };
}, { serviceName: SERVICE_NAME, scope: 'POST /api/equipment' });
