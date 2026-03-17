import { z } from 'zod';
import { createSessionReadRoute, createSessionWriteRoute } from '@rocketmanv9/chassis/nextjs';
import { AppError } from '@rocketmanv9/chassis/errors';

const SERVICE_NAME = process.env.INTERNAL_JWT_ISSUER || 'summit-one-fleet';

const CreateWorkOrderSchema = z.object({
  asset_id: z.string().uuid(),
  status: z.enum(['open', 'in_progress', 'completed', 'cancelled']).optional(),
  priority: z.string().optional(),
  description: z.string().optional(),
  assigned_to: z.string().uuid().optional(),
});

export const GET = createSessionReadRoute(async ({ req, supabase }) => {
  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const asset_id = url.searchParams.get('asset_id');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);

  let query = supabase.from('work_orders').select('*', { count: 'exact' });

  if (status) query = query.eq('status', status);
  if (asset_id) query = query.eq('asset_id', asset_id);

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw AppError.internal(error.message);

  return Response.json({ data, count, limit, offset });
}, { serviceName: SERVICE_NAME });

export const POST = createSessionWriteRoute(async ({ req, log, supabase, idempotencyKey }) => {
  const body = CreateWorkOrderSchema.parse(await req.json());

  const { data, error } = await supabase
    .from('work_orders')
    .upsert({
      asset_id: body.asset_id,
      status: body.status || 'open',
      priority: body.priority,
      description: body.description,
      assigned_to: body.assigned_to,
    })
    .select()
    .single();

  if (error) throw AppError.internal(error.message);

  log.info('work_order.created', { workOrderId: data.id });

  return {
    data,
    status: 201,
    events: [{
      event_name: 'fleet.work_order.created',
      payload: data,
      last_event_id: idempotencyKey,
    }],
  };
}, { serviceName: SERVICE_NAME, scope: 'POST /api/work-orders' });
