import { NextResponse } from 'next/server';
import { createRun, updateRun } from '@/lib/store';
import { parseInputLine } from '@/lib/pipeline';
import { aiConfigured } from '@/lib/gemini';

export const dynamic = 'force-dynamic';

// Start a run: parse the domain list, record the run, hand the inputs back to the browser.
export async function POST(req) {
  if (!aiConfigured()) return NextResponse.json({ error: 'Add GEMINI_API_KEY (or OPENROUTER_API_KEY) to .env.local first.' }, { status: 400 });
  const { text } = await req.json();
  const max = Number(process.env.MAX_DOMAINS_PER_RUN || 10);
  const lines = String(text || '').split(/\n|;/).map((l) => l.trim()).filter(Boolean);
  const inputs = [];
  const invalid = [];
  const seen = new Set();
  for (const l of lines) {
    const p = parseInputLine(l);
    if (!p) invalid.push(l);
    else if (!seen.has(p.domain)) { seen.add(p.domain); inputs.push(p); }
  }
  if (!inputs.length) return NextResponse.json({ error: 'No valid domains. One per line, e.g. rillet.com or rillet.com, Series B' }, { status: 400 });
  if (inputs.length > max) return NextResponse.json({ error: `At most ${max} domains per run (MAX_DOMAINS_PER_RUN).` }, { status: 400 });
  const run = await createRun({ source: 'web', domains: inputs.map((i) => i.raw) });
  return NextResponse.json({ run, inputs, invalid });
}

export async function PATCH(req) {
  const { id, status, summary } = await req.json();
  await updateRun(id, { status, summary, finished_at: new Date().toISOString() });
  return NextResponse.json({ ok: true });
}
