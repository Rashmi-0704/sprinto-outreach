import { NextResponse } from 'next/server';
import { addLearning, setLearning, addEvent } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const { text } = await req.json();
  if (!String(text || '').trim()) return NextResponse.json({ error: 'Empty' }, { status: 400 });
  await addLearning(String(text).trim().slice(0, 300));
  await addEvent({ kind: 'learning_added', actor: 'reviewer', note: String(text).trim().slice(0, 80) });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req) {
  const { id, active } = await req.json();
  await setLearning(id, Boolean(active));
  return NextResponse.json({ ok: true });
}
