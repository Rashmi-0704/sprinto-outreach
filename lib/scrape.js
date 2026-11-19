// Step 1: request -> parse -> clean. Single-fetch scraper: one URL, one read, robots.txt respected.
// Thin pages (JS shells) are re-read through Jina Reader, which renders the page in a real browser.
// Job boards are read through their public JSON APIs (Greenhouse, Lever, Ashby, Workable): an API beats scraping.

import * as cheerio from 'cheerio';
import { LIMITS, COMPETITORS, FRAMEWORKS } from './config.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

export function normalizeDomain(input) {
  let d = String(input || '').trim().toLowerCase();
  d = d.replace(/^https?:\/\//, '').replace(/^www\./, '');
  d = d.split(/[/?#\s]/)[0];
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) ? d : null;
}

function rootOf(host) {
  const parts = host.replace(/^www\./, '').split('.');
  return parts.slice(-2).join('.');
}

export const wordCount = (t) => (t.match(/\S+/g) || []).length;

// ---------- robots.txt ----------
const robotsCache = new Map();
async function robotsRules(origin) {
  if (robotsCache.has(origin)) return robotsCache.get(origin);
  let rules = [];
  try {
    const res = await fetch(`${origin}/robots.txt`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const lines = (await res.text()).split(/\r?\n/);
      let applies = false;
      for (const raw of lines) {
        const line = raw.split('#')[0].trim();
        const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
        if (!m) continue;
        const [, k, v] = m;
        if (k.toLowerCase() === 'user-agent') applies = v.trim() === '*';
        else if (applies && k.toLowerCase() === 'disallow' && v.trim()) rules.push({ allow: false, path: v.trim() });
        else if (applies && k.toLowerCase() === 'allow' && v.trim()) rules.push({ allow: true, path: v.trim() });
      }
    }
  } catch {
    /* no robots.txt = no rules */
  }
  robotsCache.set(origin, rules);
  return rules;
}

async function robotsAllows(url) {
  const u = new URL(url);
  const rules = await robotsRules(u.origin);
  const target = u.pathname + u.search;
  let best = null;
  for (const r of rules) {
    // Google-style matching: * is any run of characters, a trailing $ anchors the end.
    const anchored = r.path.endsWith('$');
    const body = (anchored ? r.path.slice(0, -1) : r.path).split('*').map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
    const re = new RegExp('^' + body + (anchored ? '$' : ''));
    if (re.test(target) && (!best || r.path.length > best.len)) best = { allow: r.allow, len: r.path.length };
  }
  return best ? best.allow : true;
}

// ---------- request ----------
async function request(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en' },
    redirect: 'follow',
    signal: AbortSignal.timeout(LIMITS.fetchTimeoutMs),
  });
  const html = await res.text();
  return { status: res.status, finalUrl: res.url || url, html };
}

// ---------- parse + clean ----------
const BLOCK = 'h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,td,th,dt,dd,summary,section,article,div,br,tr';

function signalsFrom(html, fullText) {
  const lowerHtml = html.toLowerCase();
  const competitors = [];
  for (const c of COMPETITORS) {
    const hit = c.patterns.find((p) => lowerHtml.includes(p));
    if (hit) competitors.push({ name: c.name, customer: Boolean(c.customer), evidence: hit });
  }
  const frameworks = [];
  for (const f of FRAMEWORKS) {
    const m = fullText.match(new RegExp(`[^.\\n]{0,90}(${f.re.source})[^.\\n]{0,90}`, 'i'));
    if (m) frameworks.push({ name: f.key, quote: m[0].replace(/\s+/g, ' ').trim() });
  }
  return { competitors, frameworks };
}

export function cleanHtml(html, pageUrl, { keepShort = false } = {}) {
  const $ = cheerio.load(html);
  const host = new URL(pageUrl).hostname;
  const root = rootOf(host);

  // Links first (nav included: it is how the loop finds /pricing, /careers, /security)
  const links = [];
  const seen = new Set();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    let abs;
    try {
      abs = new URL(href, pageUrl);
    } catch {
      return;
    }
    if (!/^https?:$/.test(abs.protocol)) return;
    abs.hash = '';
    const key = abs.toString().replace(/\/$/, '');
    if (seen.has(key)) return;
    seen.add(key);
    const text = $(el).text().replace(/\s+/g, ' ').trim().slice(0, 60);
    links.push({ href: key, text, internal: rootOf(abs.hostname) === root });
  });

  // Job boards are often embedded by script or iframe, so look for their URLs in the raw HTML too.
  for (const m of html.matchAll(/https?:\/\/(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/[a-z0-9_-]+|https?:\/\/jobs\.lever\.co\/[a-z0-9_-]+|https?:\/\/jobs\.ashbyhq\.com\/[a-z0-9_.-]+|https?:\/\/apply\.workable\.com\/[a-z0-9_-]+/gi)) {
    if (!seen.has(m[0])) {
      seen.add(m[0]);
      links.push({ href: m[0], text: 'job board (embedded)', internal: false });
    }
  }

  $('script,style,noscript,svg,iframe,template,canvas,form,button,select,input').remove();
  $('[aria-hidden="true"],[hidden]').remove();
  $('[id*="cookie" i],[class*="cookie" i],[id*="consent" i],[class*="consent" i]').remove();

  // Footer often carries certification badges ("SOC 2 Type II"), so keep its framework lines separately.
  const footerText = $('footer').text().replace(/\s+/g, ' ');
  const fullText = $('body').text().replace(/\s+/g, ' ');

  $('nav,footer,[role="navigation"],[role="contentinfo"],header nav').remove();
  $(BLOCK).each((_, el) => {
    $(el).prepend('\n');
    $(el).append('\n');
  });
  const title = $('title').first().text().trim();
  const meta = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '';

  const lines = [];
  const dedupe = new Set();
  const push = (line) => {
    const t = line.replace(/\s+/g, ' ').trim();
    if (!t) return;
    const key = t.toLowerCase();
    if (dedupe.has(key)) return;
    dedupe.add(key);
    lines.push(t);
  };
  if (meta) push(meta);
  for (const raw of $('body').text().split('\n')) {
    const t = raw.replace(/\s+/g, ' ').trim();
    // Drop fragments: under 4 words is usually a button, label or menu item.
    // On team pages a name and a title are short lines, so keepShort keeps anything with 2+ letters.
    if (wordCount(t) >= 4 || (keepShort && /[a-z]{2}/i.test(t) && t.length <= 80)) push(t);
  }
  for (const f of FRAMEWORKS) {
    const m = footerText.match(new RegExp(`[^.|]{0,60}(${f.re.source})[^.|]{0,60}`, 'i'));
    if (m) push(`FOOTER: ${m[0].trim()}`);
  }

  let text = lines.join('\n');
  if (text.length > LIMITS.charsPerPage) text = text.slice(0, LIMITS.charsPerPage);
  return { title, text, words: wordCount(text), links, signals: signalsFrom(html, fullText + ' ' + footerText) };
}

// ---------- Jina Reader fallback for JS-rendered pages ----------
async function readViaJina(url) {
  const res = await fetch(`https://r.jina.ai/${url}`, {
    headers: { Accept: 'text/plain', 'X-Return-Format': 'text' },
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`renderer ${res.status}`);
  const raw = await res.text();
  const body = raw.split(/Markdown Content:|^Content:/m).pop();
  const lines = [];
  const seen = new Set();
  for (const l of body.split('\n')) {
    const t = l.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[#*_>`]/g, '').replace(/\s+/g, ' ').trim();
    if (wordCount(t) < 4 || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    lines.push(t);
  }
  return lines.join('\n').slice(0, LIMITS.charsPerPage);
}

// ---------- job boards via public APIs ----------
const ATS = [
  { name: 'Greenhouse', re: /(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/([a-z0-9_-]+)/i, api: (s) => `https://boards-api.greenhouse.io/v1/boards/${s}/jobs`, map: (j) => (j.jobs || []).map((x) => ({ title: x.title, location: x.location?.name, posted: x.updated_at })) },
  { name: 'Lever', re: /jobs\.lever\.co\/([a-z0-9_-]+)/i, api: (s) => `https://api.lever.co/v0/postings/${s}?mode=json`, map: (j) => (Array.isArray(j) ? j : []).map((x) => ({ title: x.text, location: x.categories?.location, posted: x.createdAt ? new Date(x.createdAt).toISOString() : null })) },
  { name: 'Ashby', re: /jobs\.ashbyhq\.com\/([a-z0-9_.-]+)/i, api: (s) => `https://api.ashbyhq.com/posting-api/job-board/${s}`, map: (j) => (j.jobs || []).map((x) => ({ title: x.title, location: x.location, posted: x.publishedAt })) },
  { name: 'Workable', re: /apply\.workable\.com\/([a-z0-9_-]+)/i, api: (s) => `https://apply.workable.com/api/v1/widget/accounts/${s}`, map: (j) => (j.jobs || []).map((x) => ({ title: x.title, location: x.city || x.country, posted: x.published_on })) },
];

export function findJobBoard(links) {
  for (const l of links) {
    for (const a of ATS) {
      const m = l.href.match(a.re);
      if (m && !['embed', 'v1', 'api'].includes(m[1].toLowerCase())) return { ats: a.name, slug: m[1], url: l.href };
    }
  }
  return null;
}

export async function readJobBoard(board) {
  const a = ATS.find((x) => x.name === board.ats);
  const res = await fetch(a.api(board.slug), { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(LIMITS.fetchTimeoutMs) });
  if (!res.ok) throw new Error(`${board.ats} API ${res.status}`);
  const jobs = a.map(await res.json()).filter((j) => j.title);
  const text = jobs
    .slice(0, 80)
    .map((j) => `JOB: ${j.title}${j.location ? ` | ${j.location}` : ''}${j.posted ? ` | posted ${String(j.posted).slice(0, 10)}` : ''}`)
    .join('\n');
  return {
    url: board.url,
    kind: 'jobs',
    method: `${board.ats} public API`,
    title: `${board.ats} job board`,
    text: `OPEN ROLES TOTAL: ${jobs.length}\n${text}`.slice(0, LIMITS.charsPerPage),
    words: wordCount(text),
    links: [],
    signals: { competitors: [], frameworks: [] },
    jobCount: jobs.length,
  };
}

// ---------- one page, end to end ----------
// Returns a page object, or { url, error } when the page could not be read. Never throws.
export async function readPage(url, { keepShort = false } = {}) {
  try {
    if (!(await robotsAllows(url))) return { url, error: 'blocked by robots.txt' };
    const { status, finalUrl, html } = await request(url);
    if (status === 404 || status === 410) return { url, error: `not found (${status})` };
    if (status === 403 || status === 503 || /cf-chl|challenge-platform|captcha/i.test(html.slice(0, 5000))) {
      // Bot wall: try the renderer once, otherwise record and move on.
      try {
        const text = await readViaJina(url);
        if (wordCount(text) >= LIMITS.thinPageWords) return { url: finalUrl, kind: 'page', method: 'rendered (bot wall on plain request)', title: '', text, words: wordCount(text), links: [], signals: signalsFrom('', text) };
      } catch {}
      return { url, error: `bot protection (${status})` };
    }
    if (status >= 400) return { url, error: `HTTP ${status}` };
    const page = { url: finalUrl, kind: 'page', method: 'plain request', ...cleanHtml(html, finalUrl, { keepShort }) };
    if (page.words < LIMITS.thinPageWords) {
      try {
        const text = await readViaJina(finalUrl);
        if (wordCount(text) > page.words) {
          page.text = text;
          page.words = wordCount(text);
          page.method = 'rendered (plain request was a thin JS shell)';
          const extra = signalsFrom('', text);
          page.signals.frameworks = page.signals.frameworks.length ? page.signals.frameworks : extra.frameworks;
        }
      } catch {}
    }
    return page;
  } catch (err) {
    return { url, error: err.name === 'TimeoutError' ? 'timed out' : err.message };
  }
}

// Picks the homepage's own links to trust/security and careers pages: the first crawl, before the loop.
// Dedicated trust centres (trust.example.com, or one hosted by a vendor) are where a compliance
// platform shows itself. A plain /security page often does not mention it, so we read both.
const TRUST_HOSTS = /(^|\.)(trust|security|compliance|trustcenter)\.|trust\.vanta\.com|app\.vanta\.com|trust\.drata\.com|secureframe\.com\/trust|safebase\.io|trustcenter\.|trust\.page$/i;
export function trustCenters(links, domain) {
  const out = [];
  for (const l of links) {
    let u;
    try { u = new URL(l.href); } catch { continue; }
    if (!TRUST_HOSTS.test(u.hostname) && !TRUST_HOSTS.test(u.hostname + u.pathname)) continue;
    // a subdomain must belong to this company; vendor-hosted pages are taken as linked
    const own = u.hostname === domain || u.hostname.endsWith(`.${domain}`);
    const vendor = /vanta|drata|secureframe|safebase|trust\.page/i.test(u.hostname);
    if ((own && u.hostname !== domain && u.hostname !== `www.${domain}`) || vendor) {
      const key = `${u.protocol}//${u.hostname}${u.pathname.replace(/\/$/, '')}`;
      if (!out.includes(key)) out.push(key);
    }
  }
  return out;
}

export function pickLinks(links, kinds) {
  const out = {};
  const tests = {
    trust: /\/(trust|security|compliance)(\/|$)|^https?:\/\/(trust|security)\./i,
    careers: /\/(careers|jobs|join|join-us|work-with-us|hiring)(\/|$)/i,
    pricing: /\/pricing(\/|$)/i,
    customers: /\/(customers|case-studies|customer-stories)(\/|$)/i,
    about: /\/(about|about-us|company)(\/|$)/i,
  };
  for (const k of kinds) {
    const hit = links.find((l) => tests[k].test(l.href) && (l.internal || k === 'trust'));
    if (hit) out[k] = hit.href;
  }
  return out;
}
