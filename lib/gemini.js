// One small wrapper for every AI call. REST only, no SDK.
// GEMINI_API_KEY goes straight to Google AI Studio; OPENROUTER_API_KEY routes Gemini through OpenRouter.

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const RPM = Number(process.env.GEMINI_RPM || 10);
const GAP_MS = Math.ceil(60000 / Math.max(1, RPM));
let nextSlot = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForSlot() {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + GAP_MS;
  if (at > now) await sleep(at - now);
}

export function aiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY);
}

export function modelName() {
  return process.env.GEMINI_MODEL || 'gemini-3.8-flash';
}

function parseJson(text) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.search(/[[{]/);
    const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error('Gemini did not return valid JSON.');
  }
}

// Returns { data, usage: { in, out } }. `json` asks for a JSON object back.
export async function gemini({ prompt, system, json = true, temperature = 0.2, timeoutMs = 60000 }) {
  if (process.env.OPENROUTER_API_KEY) return viaOpenRouter({ prompt, system, json, temperature, timeoutMs });

  const key = (process.env.GEMINI_API_KEY || '').trim();
  if (!key) throw new Error('Set GEMINI_API_KEY (or OPENROUTER_API_KEY) in .env.local.');
  const model = modelName();
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (json) body.generationConfig.responseMimeType = 'application/json';

  // Main model first; if it is overloaded, missing or too slow, fall back to a lighter one.
  const fallback = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite';
  const chain = [...new Set([model, fallback, 'gemini-flash-lite-latest'].filter(Boolean))];
  // Rotate through the chain twice: overload on one model rarely means overload on all of them.
  const plan = [model, ...chain.slice(1), ...chain];
  let lastError;
  for (let attempt = 0; attempt < plan.length; attempt++) {
    const m = plan[attempt];
    await waitForSlot();
    let res;
    try {
      res = await fetch(`${BASE}/${m}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
        cache: 'no-store',
        signal: AbortSignal.timeout(m === model ? Math.min(timeoutMs, 45000) : timeoutMs),
      });
    } catch (err) {
      lastError = new Error(`Gemini (${m}) ${err.name === 'TimeoutError' ? 'timed out' : err.message}`);
      // a timeout moves on to the next model in the plan
      continue;
    }
    if (res.ok) {
      const data = await res.json();
      const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
      if (!text) throw new Error('Gemini returned an empty response.');
      const usage = { in: data.usageMetadata?.promptTokenCount || 0, out: data.usageMetadata?.candidatesTokenCount || 0, model: m };
      return { data: json ? parseJson(text) : text, usage };
    }
    const text = await res.text();
    lastError = new Error(`Gemini ${m} ${res.status}: ${text.slice(0, 300)}`);
    if (res.status === 404) continue;
    if (res.status === 429 || res.status >= 500 || res.status === 404) {
      const r = text.match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/);
      await sleep(r ? Math.min(20000, Number(r[1]) * 1000) : Math.min(15000, 4000 * (attempt + 1)));
      continue;
    }
    break;
  }
  throw lastError;
}

async function viaOpenRouter({ prompt, system, json, temperature, timeoutMs }) {
  const model = modelName();
  const body = {
    model: model.startsWith('google/') ? model : `google/${model}`,
    messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }],
    temperature,
  };
  if (json) body.response_format = { type: 'json_object' };
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    await waitForSlot();
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'X-Title': 'Sprinto Outreach' },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) {
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || '';
      if (!text) throw new Error('Gemini (OpenRouter) returned an empty response.');
      const usage = { in: data.usage?.prompt_tokens || 0, out: data.usage?.completion_tokens || 0 };
      return { data: json ? parseJson(text) : text, usage };
    }
    const text = await res.text();
    lastError = new Error(`OpenRouter ${res.status}: ${text.slice(0, 300)}`);
    if (res.status === 429 || res.status >= 500) {
      await sleep(4000 * (attempt + 1));
      continue;
    }
    break;
  }
  throw lastError;
}
