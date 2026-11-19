import { runCompany } from '@/lib/pipeline';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Runs the whole pipeline for one domain and streams each step back as NDJSON.
export async function POST(req) {
  const { runId, input, existingId } = await req.json();
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (evt) => controller.enqueue(encoder.encode(JSON.stringify(evt) + '\n'));
      try {
        await runCompany({ input, runId, emit, existingId });
      } catch (err) {
        emit({ type: 'done', status: 'error', reason: err.message });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' } });
}
