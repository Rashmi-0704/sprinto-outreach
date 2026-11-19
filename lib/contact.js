// Step 4: find the point of contact.
// Option A: Hunter.io Domain Search. Option B: data/contacts.json (looked up by hand in Apollo).
// The person is chosen by code: stage decides the title order, first matching title wins.

import fs from 'node:fs/promises';
import path from 'node:path';
import { TITLE_RULES, TITLE_ALIASES } from './config.js';
import { readPage } from './scrape.js';
import { gemini } from './gemini.js';
import { quoteFound } from './extract.js';

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

// Option C: leaders named on the company's own site (About / Team / Leadership pages).
// Gemini only lists names it can quote; code checks each quote is on the page and the title rules pick.
// The address is a first-name@domain guess, marked unverified. Safe here: every email goes to MY_EMAIL only.
const PEOPLE_PATH = /\/(about|about-us|team|our-team|leadership|company|people|founders)(\/|$)/i;
export async function websiteContacts(domain, pages = []) {
  const home = pages[0];
  const linked = (home?.links || []).filter((l) => l.internal && PEOPLE_PATH.test(l.href)).map((l) => l.href);
  const tries = [...new Set([...linked, `https://${domain}/about`, `https://${domain}/team`, `https://${domain}/about-us`, `https://${domain}/company`])].slice(0, 5);
  const read = [];
  for (const u of tries) {
    if (read.length >= 2) break;
    if (pages.some((p) => p.url?.replace(/\/$/, '') === u.replace(/\/$/, ''))) continue;
    const pg = await readPage(u);
    if (!pg.error && pg.words > 40) read.push(pg);
  }
  const pool = [...read, ...pages.filter((p) => p.kind !== 'jobs' && p.text)].slice(0, 5);
  if (!pool.length) return { people: [], read: [] };
  const prompt = `List every real person named on these pages of ${domain} together with their job title at the company.
Only include a person if the page shows both their name and their title. Copy a short verbatim "quote" from the page that contains the name (and ideally the title).
Pages:
${pool.map((p, i) => `--- PAGE ${i + 1} (${p.url})\n${String(p.text).slice(0, 5000)}`).join('\n')}

Return {"people":[{"full_name":"...","title":"...","quote":"exact text from the page","page":1}]}. Return {"people":[]} if nobody is named with a title.`;
  const { data, usage } = await gemini({ prompt, temperature: 0 });
  const people = [];
  for (const x of data?.people || []) {
    const pg = pool[(Number(x.page) || 1) - 1] || pool[0];
    const name = String(x.full_name || '').trim();
    const [first, ...rest] = name.split(/\s+/);
    if (!first || !x.title || !quoteFound(x.quote, pg.text) || !quoteFound(first, x.quote)) continue;
    const local = first.normalize('NFD').replace(/[^a-zA-Z]/g, '').toLowerCase();
    if (!local) continue;
    people.push({ first_name: first, last_name: rest.join(' '), title: String(x.title), email: `${local}@${domain}`, email_verified: false, quote: x.quote, url: pg.url, source: 'website' });
  }
  return { people, read: read.map((r) => r.url), usage };
}

// Returns { contact, trail: [gate entries], flag? }
export async function findContact(domain, stage, override = null, pages = []) {
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

  let usage = null;
  try {
    const w = await websiteContacts(domain, pages);
    usage = w.usage || null;
    trail.push({ key: 'website_people', name: 'Leaders named on their site', result: 'info', by: 'model', note: `${w.people.length} person(s) with a title, quotes verified${w.read.length ? ` · read ${w.read.join(', ')}` : ''}` });
    const site = pickContact(w.people, stage);
    if (site.contact) {
      const c = site.contact;
      trail.push({ key: 'contact', name: 'Point of contact', result: 'pass', by: 'rule', note: `${site.note.replace(/; Hunter confidence.*/, '')} · named on ${c.url} · email ${c.email} is a first-name guess (unverified; mail goes to your inbox only)`, quote: c.quote, url: c.url });
      return { contact: c, trail, usage, flag: 'email unverified (from website)' };
    }
  } catch (err) {
    trail.push({ key: 'website_people', name: 'Leaders named on their site', result: 'unknown', by: 'model', note: err.message });
  }

  trail.push({ key: 'contact', name: 'Point of contact', result: 'unknown', by: 'rule', note: 'no decision-maker found: waits in the review queue for a name' });
  return { contact: null, trail, usage, flag: 'no contact found' };
}
