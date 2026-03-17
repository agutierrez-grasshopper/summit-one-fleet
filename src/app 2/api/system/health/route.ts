import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: process.env.INTERNAL_JWT_ISSUER || 'unknown',
  });
}
