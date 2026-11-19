// Step 4: find the point of contact.
// Option A: Hunter.io Domain Search. Option B: data/contacts.json (looked up by hand in Apollo).
// The person is chosen by code: stage decides the title order, first matching title wins.

import fs from 'node:fs/promises';
import path from 'node:path';
import { TITLE_RULES, TITLE_ALIASES } from './config.js';

export function canonicalTitle(title) {
  if (!title) return null;
  for (const [canon, re] of TITLE_ALIASES) if (re.test(title)) return canon;
  return null;
}

function rulesFor(stage) {
  return TITLE_RULES[stage] || TITLE_RULES.default;
}

// people: [{ first_name, last_name, title, email, confidence, source }]
export function pickContact(people, stage) {
  const order = rulesFor(stage);
  const ranked = [];
  for (const p of people) {
    if (!p.email || !p.first_name) continue;
    const canon = canonicalTitle(p.title);
    const rank = canon ? order.indexOf(canon) : -1;
    if (rank >= 0) ranked.push({ ...p, canon, rank });
  }
  ranked.sort((a, b) => a.rank - b.rank || (b.confidence || 0) - (a.confidence || 0));
  const best = ranked[0];
  if (!best) return { contact: null, order, considered: people.length };
  return {
    contact: best,
    order,
    considered: people.length,
    note: `${stage ? stage.replace('_', ' ') : 'unknown stage'} rule order [${order.join(', ')}]: '${best.title}' matches '${best.canon}' (rank ${best.rank + 1} of ${order.length})${best.confidence ? `; Hunter confidence ${best.confidence}` : ''}`,
  };
}

export async function hunterSearch(domain) {
  const key = process.env.HUNTER_API_KEY;
  if (!key) return { people: [], skipped: 'no HUNTER_API_KEY' };
  const url = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&type=personal&limit=10&api_key=${key}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Hunter ${res.status}: ${json?.errors?.[0]?.details || 'request failed'}`);
  const people = (json.data?.emails || []).map((e) => ({
    first_name: e.first_name,
    last_name: e.last_name,
    title: e.position,
    email: e.value,
    confidence: e.confidence,
    linkedin: e.linkedin,
    source: 'hunter',
  }));
  return { people, org: json.data?.organization || null };
}

export async function hunterCredits() {
  const key = process.env.HUNTER_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`https://api.hunter.io/v2/account?api_key=${key}`, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
    const j = await res.json();
    const s = j.data?.requests?.searches;
    return s ? { used: s.used, available: s.available } : null;
  } catch {
    return null;
  }
}

export async function manualContact(domain) {
  try {
    const file = path.join(process.cwd(), 'data', 'contacts.json');
    const all = JSON.parse(await fs.readFile(file, 'utf8'));
    const c = all[domain] || all[`www.${domain}`];
    return c ? { ...c, source: c.source || 'apollo' } : null;
  } catch {
    return null;
  }
}

// Returns { contact, trail: [gate entries], flag? }
export async function findContact(domain, stage, override = null) {
  const trail = [];
  if (override?.email) {
    trail.push({ key: 'contact', name: 'Point of contact', result: 'pass', by: 'reviewer', note: `provided by reviewer: ${override.title || 'no title'}`, quote: `${override.first_name} ${override.last_name || ''} <${override.email}>` });
    return { contact: { ...override, source: 'reviewer' }, trail };
  }

  let people = [];
  try {
    const r = await hunterSearch(domain);
    people = r.people;
    if (r.skipped) trail.push({ key: 'hunter', name: 'Hunter domain search', result: 'info', by: 'rule', note: `skipped: ${r.skipped}; using data/contacts.json` });
    else trail.push({ key: 'hunter', name: 'Hunter domain search', result: 'info', by: 'rule', note: `${people.length} people with a title at ${domain}` });
  } catch (err) {
    trail.push({ key: 'hunter', name: 'Hunter domain search', result: 'unknown', by: 'rule', note: err.message });
  }

  const picked = pickContact(people, stage);
  if (picked.contact) {
    trail.push({ key: 'contact', name: 'Point of contact', result: 'pass', by: 'rule', note: picked.note, quote: picked.contact.title });
    return { contact: picked.contact, trail };
  }
  if (people.length) {
    trail.push({ key: 'contact_titles', name: 'Title rules', result: 'unknown', by: 'rule', note: `none of ${people.length} titles match [${picked.order.join(', ')}]: ${people.slice(0, 5).map((p) => p.title || 'no title').join('; ')}` });
  }

  const manual = await manualContact(domain);
  if (manual) {
    trail.push({ key: 'contact', name: 'Point of contact', result: 'pass', by: 'input', note: `from data/contacts.json (looked up in ${manual.source})`, quote: manual.title });
    return { contact: { ...manual, canon: canonicalTitle(manual.title) }, trail };
  }

  trail.push({ key: 'contact', name: 'Point of contact', result: 'unknown', by: 'rule', note: 'no decision-maker found: waits in the review queue for a name' });
  return { contact: null, trail, flag: 'no contact found' };
}
