import { NextResponse } from 'next/server';
import { getCompany } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET(_req, { params }) {
  const c = await getCompany(params.id);
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ run_id: c.run_id, input: c.input || { domain: c.domain, raw: c.domain, stageHint: null } });
}
