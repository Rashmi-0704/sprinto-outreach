// Step 2: Gemini turns cleaned page text into named fields, each with a verbatim quote.
// Code then checks every quote against the page it claims to come from. No quote match, no fact.

import { gemini } from './gemini.js';
import { PRESSURE_SIGNALS } from './config.js';

const STAGE_ENUM = ['pre_seed', 'seed', 'series_a', 'series_b', 'series_c', 'series_d_plus', 'public', 'bootstrapped'];

const SYSTEM = `You extract facts about a company from its own web pages for a B2B sales researcher.
Rules:
- Only use what the pages say. If a fact is not stated, use null (or an empty list). Never guess.
- Every fact needs "quote": a short VERBATIM span (5-30 words) copied exactly from the page text, and "page": the page id like "P2".
- Keep quotes exact: same words, same order. Do not paraphrase inside a quote.
- Return JSON only.`;

function schemaText() {
  return `Return this JSON shape:
{
  "company_name": {"value": string|null, "quote": string|null, "page": string|null},
  "what_they_sell": {"value": "one plain sentence"|null, "quote": ..., "page": ...},
  "buyer": {"value": "who buys it, e.g. 'finance teams at mid-market companies'"|null, "quote": ..., "page": ...},
  "is_b2b_saas": {"value": true|false|null, "quote": ..., "page": ...},   // true only if it is software sold as a subscription/service to businesses
  "funding_stage": {"value": one of ${JSON.stringify(STAGE_ENUM)} | null, "quote": ..., "page": ...},
  "funding_detail": {"value": "e.g. '$20M Series A led by Accel, March 2026'"|null, "quote": ..., "page": ...},
  "employee_count": {"value": integer|null, "quote": ..., "page": ...},
  "industry": {"value": string|null, "quote": ..., "page": ...},   // the industry their CUSTOMERS are in, e.g. 'banks', 'hospitals', 'any B2B'
  "open_roles_count": {"value": integer|null, "quote": ..., "page": ...},
  "certifications": [{"name": "SOC 2"|"ISO 27001"|"HIPAA"|"GDPR"|"PCI DSS"|other, "status": "held"|"in_progress", "quote": ..., "page": ...}],
  "pressure_signals": [{"type": one of ${JSON.stringify(Object.keys(PRESSURE_SIGNALS))}, "detail": "short note", "quote": ..., "page": ...}],
  "compliance_roles": [{"title": "open role in security / GRC / compliance / IT", "quote": ..., "page": ...}],
  "notable_customers": [{"name": string, "quote": ..., "page": ...}],
  "recent_news": [{"detail": "launch, funding, expansion, milestone", "quote": ..., "page": ...}]
}
pressure_signals meanings: ${Object.entries(PRESSURE_SIGNALS).map(([k, v]) => `${k} = ${v}`).join('; ')}.`;
}

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[‘’‛']/g, "'")
    .replace(/[“”"]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.,;:"'-]+|[\s.,;:"'-]+$/g, '')
    .trim();

export function quoteFound(quote, text) {
  if (!quote || !text) return false;
  const hay = norm(text);
  return String(quote)
    .split(/\.\.\.|…/)
    .map(norm)
    .filter((p) => p.length >= 4)
    .every((p) => hay.includes(p));
}

// Checks one fact against the pages. Returns the fact with url attached, or null.
function verify(fact, pagesById, rejected, field) {
  if (!fact || fact.value === null || fact.value === undefined || fact.value === '') {
    if (!fact || (!fact.name && !fact.title && !fact.detail && !fact.type)) return null;
  }
  const page = pagesById[fact.page];
  if (page && quoteFound(fact.quote, page.text)) return { ...fact, url: page.url };
  // The model sometimes cites the wrong page id. Accept the quote if it is on any page.
  const other = Object.values(pagesById).find((p) => quoteFound(fact.quote, p.text));
  if (other) return { ...fact, page: other.id, url: other.url };
  rejected.push({ field, value: fact.value ?? fact.name ?? fact.title ?? fact.detail ?? fact.type, quote: fact.quote || null });
  return null;
}

const SCALARS = ['company_name', 'what_they_sell', 'buyer', 'is_b2b_saas', 'funding_stage', 'funding_detail', 'employee_count', 'industry', 'open_roles_count'];
const LISTS = ['certifications', 'pressure_signals', 'compliance_roles', 'notable_customers', 'recent_news'];

export function emptyFacts() {
  const f = {};
  for (const k of SCALARS) f[k] = null;
  for (const k of LISTS) f[k] = [];
  f.rejected = [];
  return f;
}

// pages: [{ id: 'P1', url, text, kind }]. Returns { facts, usage } with only verified facts.
export async function extractFacts(pages, known = null) {
  const pagesById = Object.fromEntries(pages.map((p) => [p.id, p]));
  const body = pages.map((p) => `=== ${p.id} | ${p.url} ===\n${p.text}`).join('\n\n');
  const prompt = `${schemaText()}\n\n${known ? `Already known (do not repeat unless a page adds detail):\n${JSON.stringify(known)}\n\n` : ''}PAGES:\n${body}`;
  const { data, usage } = await gemini({ prompt, system: SYSTEM, temperature: 0.1 });

  const facts = emptyFacts();
  for (const k of SCALARS) {
    const v = verify(data?.[k], pagesById, facts.rejected, k);
    if (v && v.value !== null && v.value !== undefined) facts[k] = v;
  }
  if (facts.funding_stage && !STAGE_ENUM.includes(facts.funding_stage.value)) facts.funding_stage = null;
  if (facts.employee_count) facts.employee_count.value = Number(facts.employee_count.value) || null;
  if (facts.open_roles_count) facts.open_roles_count.value = Number(facts.open_roles_count.value) || null;
  for (const k of LISTS) {
    for (const item of Array.isArray(data?.[k]) ? data[k] : []) {
      const v = verify(item, pagesById, facts.rejected, k);
      if (v) facts[k].push(v);
    }
  }
  facts.pressure_signals = facts.pressure_signals.filter((s) => PRESSURE_SIGNALS[s.type]);
  return { facts, usage };
}

// Fill gaps in `base` with `extra`. Scalars: keep the first verified value. Lists: union.
export function mergeFacts(base, extra) {
  const out = { ...base };
  for (const k of SCALARS) if (!out[k] && extra[k]) out[k] = extra[k];
  for (const k of LISTS) {
    const seen = new Set(out[k].map((x) => JSON.stringify([x.name || x.title || x.type || x.detail, x.quote])));
    out[k] = [...out[k]];
    for (const x of extra[k] || []) {
      const key = JSON.stringify([x.name || x.title || x.type || x.detail, x.quote]);
      if (!seen.has(key)) out[k].push(x);
    }
  }
  out.rejected = [...(base.rejected || []), ...(extra.rejected || [])];
  return out;
}
