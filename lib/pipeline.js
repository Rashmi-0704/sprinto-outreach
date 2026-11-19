// The 7-step pipeline for one domain. Repeatable: no step waits for a human.
// What the rules cannot settle is parked (review queue or drafts), never guessed.

import { readPage, pickLinks, trustCenters, findJobBoard, readJobBoard, normalizeDomain } from './scrape.js';
import { extractFacts, mergeFacts, emptyFacts } from './extract.js';
import { evaluate, chooseNextPage, loopBudget } from './qualify.js';
import { findContact } from './contact.js';
import { writeEmail, validateDraft } from './write.js';
import { sendEmail, gmailConfigured, autoSendOn } from './send.js';
import { saveCompany, getCompany, addEvent, listLearnings } from './store.js';
import { LIMITS, STAGES } from './config.js';

export const STEPS = ['Scrape', 'Extract', 'Qualify', 'Find PoC', 'Pain points', 'Draft', 'Send'];

const STAGE_WORDS = [
  ['pre_seed', /pre[\s-]?seed/i],
  ['seed', /^seed$|\bseed\b/i],
  ['series_a', /series\s*a\b|\ba$/i],
  ['series_b', /series\s*b\b|\bb$/i],
  ['series_c', /series\s*c\b|\bc$/i],
  ['series_d_plus', /series\s*[d-z]\b/i],
  ['public', /public|ipo/i],
];

// "rillet.com" or "rillet.com, Series B" or "rillet.com | series_b"
export function parseInputLine(line) {
  const [rawDomain, ...rest] = String(line).split(/[,|\t]/);
  const domain = normalizeDomain(rawDomain);
  if (!domain) return null;
  const extra = rest.join(' ').trim();
  let stage = null;
  if (extra) for (const [k, re] of STAGE_WORDS) if (re.test(extra.replace(/_/g, ' '))) { stage = k; break; }
  return { domain, raw: line.trim(), stageHint: stage ? { stage, raw: extra } : null };
}

function addUsage(company, stage, usage) {
  if (!usage) return;
  company.usage = company.usage || {};
  const u = (company.usage[stage] = company.usage[stage] || { calls: 0, in: 0, out: 0 });
  u.calls += 1;
  u.in += usage.in || 0;
  u.out += usage.out || 0;
}

const pathOf = (url) => {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '') + (u.pathname === '/' ? '' : u.pathname);
  } catch {
    return url;
  }
};

function compactFacts(f) {
  const v = (x) => (x ? x.value : null);
  return {
    is_b2b_saas: v(f.is_b2b_saas),
    funding_stage: v(f.funding_stage),
    employee_count: v(f.employee_count),
    certifications: f.certifications.map((c) => `${c.name} (${c.status})`),
    pressure_signals: f.pressure_signals.map((s) => s.type),
  };
}

function aggregateSignals(pages) {
  const competitors = [];
  const frameworks = [];
  for (const p of pages) {
    for (const c of p.signals?.competitors || []) if (!competitors.some((x) => x.name === c.name)) competitors.push({ ...c, url: p.url });
    for (const f of p.signals?.frameworks || []) frameworks.push({ ...f, url: p.url });
  }
  return { competitors, frameworks };
}

// ---------------------------------------------------------------------------
export async function runCompany({ input, runId, emit = () => {}, existingId = null }) {
  const t0 = Date.now();
  let company = {
    id: existingId || undefined,
    run_id: runId || null,
    domain: input.domain,
    name: input.domain,
    input,
    status: 'running',
    status_reason: null,
    flags: [],
    trail: [],
    pages: [],
    usage: {},
  };
  company = await saveCompany(company);
  emit({ type: 'company', id: company.id, domain: company.domain });

  const log = (stage, entry) => {
    const e = { stage, at: new Date().toISOString(), ...entry };
    company.trail.push(e);
    emit({ type: 'trail', entry: e });
  };
  const step = (n, state, note) => emit({ type: 'step', step: n, state, note });

  try {
    // ---------------- 1. Scrape ----------------
    step(1, 'active');
    let home = await readPage(`https://${input.domain}`);
    if (home.error) home = await readPage(`https://www.${input.domain}`);
    if (home.error) {
      log('scrape', { key: 'homepage', name: 'Homepage', result: 'fail', by: 'rule', note: home.error, url: `https://${input.domain}` });
      step(1, 'fail', home.error);
      return await park(company, 'review', `site unreachable: ${home.error}`, emit, t0);
    }
    const pages = [];
    const addPage = (p, why) => {
      const id = `P${pages.length + 1}`;
      const page = { id, ...p };
      pages.push(page);
      log('scrape', { key: 'page', name: `Read ${pathOf(p.url)}`, result: 'info', by: 'rule', note: `${why} · ${p.method} · ${p.words} words`, url: p.url });
      return page;
    };
    addPage(home, 'homepage');
    const crawl = pickLinks(home.links, ['trust', 'careers']);
    let trustRead = false;
    if (crawl.trust) {
      const t = await readPage(crawl.trust);
      if (!t.error) {
        addPage(t, 'trust/security page linked from homepage');
        trustRead = true;
      } else log('scrape', { key: 'page', name: `Read ${pathOf(crawl.trust)}`, result: 'unknown', by: 'rule', note: t.error, url: crawl.trust });
    }
    // A dedicated trust centre (e.g. trust.dreamdata.io) is read too, even when /security was read:
    // that is where a Vanta or Drata trust centre gives itself away. If none is linked, try trust.<domain>.
    const centres = trustCenters(home.links, input.domain).filter((u) => u.replace(/\/$/, '') !== String(crawl.trust || '').replace(/\/$/, ''));
    const linked = centres.length > 0;
    if (!linked) centres.push(`https://trust.${input.domain}`);
    const tc = await readPage(centres[0]);
    if (!tc.error) {
      addPage(tc, linked ? 'trust centre linked from homepage' : 'trust centre found at trust subdomain (not linked)');
      trustRead = true;
    } else if (linked) log('scrape', { key: 'page', name: `Read ${pathOf(centres[0])}`, result: 'unknown', by: 'rule', note: tc.error, url: centres[0] });
    let careers = null;
    if (crawl.careers) {
      careers = await readPage(crawl.careers);
      if (!careers.error) addPage(careers, 'careers page linked from homepage');
      else log('scrape', { key: 'page', name: `Read ${pathOf(crawl.careers)}`, result: 'unknown', by: 'rule', note: careers.error, url: crawl.careers });
    }
    let jobCount = null;
    let jobUrl = null;
    const board = findJobBoard([...home.links, ...(careers?.links || [])]);
    if (board) {
      try {
        const jobs = await readJobBoard(board);
        addPage(jobs, `job board found on site (${board.ats})`);
        jobCount = jobs.jobCount;
        jobUrl = jobs.url;
      } catch (err) {
        log('scrape', { key: 'jobs', name: `${board.ats} job board`, result: 'unknown', by: 'rule', note: err.message, url: board.url });
      }
    }
    company.pages = pages;
    step(1, 'done', `${pages.length} page(s)`);

    // ---------------- 2. Extract ----------------
    step(2, 'active');
    const ex = await extractFacts(pages);
    addUsage(company, 'extract', ex.usage);
    let facts = ex.facts;
    const verified = Object.values(facts).filter((v) => v && (Array.isArray(v) ? v.length : v.value !== undefined)).length;
    log('extract', { key: 'facts', name: 'Facts with verbatim quotes', result: 'info', by: 'model', note: `${verified} field(s) verified against page text; ${facts.rejected.length} discarded (quote not on page)` });
    company.name = facts.company_name?.value || home.title?.split(/[|\-–:]/)[0].trim() || input.domain;
    company.facts = facts;
    step(2, 'done', `${verified} verified`);

    // ---------------- 3. Qualify + agent loop ----------------
    step(3, 'active');
    const allLinks = () => pages.flatMap((p) => p.links || []);
    const ctx = () => ({ ruleSignals: aggregateSignals(pages), hint: input.stageHint, pagesRead: pages.length, trustRead, jobCount, jobUrl, loopDone: false });
    let q = evaluate(facts, ctx());
    let loops = 0;
    while (q.verdict === 'needs_info' && loops < loopBudget && pages.length < LIMITS.maxPages) {
      loops += 1;
      const pick = await chooseNextPage({ missing: q.missing, links: allLinks(), fetched: pages.map((p) => p.url), domain: input.domain });
      if (pick?.usage) addUsage(company, 'loop', pick.usage);
      if (!pick) {
        log('loop', { key: 'loop', name: `Loop ${loops}: nothing left to fetch`, result: 'info', by: 'rule', note: `open: ${q.missing.join(', ')}` });
        break;
      }
      emit({ type: 'step', step: 3, state: 'active', note: `loop ${loops}: ${pathOf(pick.url)}` });
      const p = await readPage(pick.url);
      if (p.error) {
        log('loop', { key: 'loop', name: `Loop ${loops}: fetch ${pathOf(pick.url)}`, result: 'unknown', by: pick.by === 'agent' ? 'agent' : 'rule', note: `${pick.why} → ${p.error}`, url: pick.url });
        pages.push({ id: `X${loops}`, url: pick.url, error: p.error, kind: 'failed', links: [] });
        continue;
      }
      const page = { id: `P${pages.filter((x) => !x.error).length + 1}`, ...p };
      pages.push(page);
      if (/trust|security|compliance/i.test(pick.url)) trustRead = true;
      const more = await extractFacts([page], compactFacts(facts));
      addUsage(company, 'loop', more.usage);
      const before = q.missing;
      facts = mergeFacts(facts, more.facts);
      q = evaluate(facts, ctx());
      const answered = before.filter((m) => !q.missing.includes(m));
      log('loop', {
        key: 'loop',
        name: `Loop ${loops}: fetch ${pathOf(pick.url)}`,
        result: answered.length ? 'pass' : 'info',
        by: pick.by === 'agent' ? 'agent' : 'rule',
        note: `${pick.why} → ${answered.length ? `answered ${answered.join(', ')}` : 'no new answer'}${q.missing.length ? `; still open: ${q.missing.join(', ')}` : ''}`,
        url: pick.url,
      });
    }
    if (q.verdict === 'needs_info') q = evaluate(facts, { ...ctx(), loopDone: true });
    company.pages = pages;
    company.facts = facts;
    company.loops = loops;
    company.qualification = q;
    company.stage = facts.funding_stage?.value || input.stageHint?.stage || null;
    company.fit = q.fit;
    company.flags = q.flags || [];
    for (const g of q.gates) log('qualify', { ...g });

    if (q.verdict === 'dropped') {
      step(3, 'fail', q.reason);
      return await park(company, 'dropped', q.reason, emit, t0);
    }
    if (q.verdict === 'review') {
      step(3, 'fail', q.reason);
      return await park(company, 'review', q.reason, emit, t0);
    }
    step(3, 'done', `fit ${q.fit}${loops ? ` · ${loops} loop fetch(es)` : ''}`);

    return await fromContact(company, { emit, log, step, t0 });
  } catch (err) {
    log('error', { key: 'error', name: 'Pipeline error', result: 'fail', by: 'rule', note: err.message });
    return await park(company, 'error', err.message, emit, t0);
  }
}

// Steps 4-7. Also used to resume a company from the review queue.
async function fromContact(company, { emit, log, step, t0, contactOverride = null }) {
  // ---------------- 4. Find PoC ----------------
  step(4, 'active');
  const found = await findContact(company.domain, company.stage, contactOverride);
  for (const t of found.trail) log('contact', t);
  if (!found.contact) {
    step(4, 'fail', 'no contact');
    return await park(company, 'review', 'no decision-maker found', emit, t0);
  }
  company.contact = found.contact;
  step(4, 'done', `${found.contact.first_name} · ${found.contact.title}`);

  // ---------------- 5 + 6. Pain points + draft ----------------
  step(5, 'active');
  const learnings = (await listLearnings({ activeOnly: true })).slice(0, 12).map((l) => l.text);
  let { draft, evidence, usage } = await writeEmail({ company, facts: company.facts, qualification: company.qualification, contact: found.contact, learnings });
  addUsage(company, 'write', usage);
  // One automatic rewrite if the validator finds problems; the human only sees what survives that.
  let rewritten = false;
  const first = validateDraft(draft, { contact: found.contact, company, evidence });
  if (!first.ok) {
    const failed = first.checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.note}`);
    try {
      const second = await writeEmail({ company, facts: company.facts, qualification: company.qualification, contact: found.contact, learnings, revise: failed });
      addUsage(company, 'write', second.usage);
      const v2 = validateDraft(second.draft, { contact: found.contact, company, evidence: second.evidence });
      if (v2.checks.filter((c) => c.ok).length >= first.checks.filter((c) => c.ok).length) {
        draft = second.draft;
        evidence = second.evidence;
        rewritten = true;
      }
      log('draft', { key: 'rewrite', name: 'Automatic rewrite', result: v2.ok ? 'pass' : 'info', by: 'rule', note: `first draft failed: ${failed.join(' · ')}${v2.ok ? ' → rewrite passed' : ' → rewrite still failing'}` });
    } catch (err) {
      log('draft', { key: 'rewrite', name: 'Automatic rewrite', result: 'unknown', by: 'rule', note: err.message });
    }
  }
  for (const p of draft.pain_points) log('pain', { key: 'pain', name: p.title, result: 'info', by: 'model', note: p.why, quote: p.evidence_quote });
  step(5, 'done', draft.pain_points.map((p) => p.title).join(' / '));
  step(6, 'active');
  const validation = validateDraft(draft, { contact: found.contact, company, evidence });
  company.draft = { ...draft, evidence, validation, rewritten, original: { subject: draft.subject, body: draft.body }, learnings_used: learnings.length };
  log('draft', { key: 'validator', name: 'Draft validator', result: validation.ok ? 'pass' : 'fail', by: 'rule', note: validation.checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.note}`).join(' · ') || `${validation.checks.length} checks passed` });
  step(6, validation.ok ? 'done' : 'fail', validation.ok ? 'validated' : 'needs review');

  // ---------------- 7. Send ----------------
  const blocking = (company.flags || []).filter((f) => /unknown/i.test(f));
  const holdReason = !validation.ok
    ? `validator: ${validation.checks.filter((c) => !c.ok).map((c) => c.name).join(', ')}`
    : blocking.length
      ? `flagged: ${blocking.join(', ')}`
      : !autoSendOn()
        ? 'auto-send is off'
        : !gmailConfigured()
          ? 'Gmail not configured'
          : null;
  if (holdReason) {
    log('send', { key: 'send', name: 'Auto send', result: 'unknown', by: 'rule', note: `held for a human: ${holdReason}` });
    step(7, 'skip', 'held');
    return await park(company, 'draft', holdReason, emit, t0);
  }
  step(7, 'active');
  const sent = await sendEmail({ subject: draft.subject, body: draft.body, contact: found.contact, company });
  company.sent = { ...sent, auto: true, subject: draft.subject, body: draft.body };
  log('send', { key: 'send', name: 'Auto send', result: 'pass', by: 'rule', note: `validated draft, no flags: sent to ${sent.to}` });
  await addEvent({ kind: 'sent', company_id: company.id, company: company.name, actor: 'system', note: 'auto-sent' });
  step(7, 'done', 'sent');
  return await park(company, 'sent', null, emit, t0);
}

async function park(company, status, reason, emit, t0) {
  company.status = status;
  company.status_reason = reason;
  company.duration_ms = (company.duration_ms || 0) + (Date.now() - t0);
  const saved = await saveCompany(company);
  emit({ type: 'done', id: saved.id, status, reason, name: saved.name, fit: saved.fit, contact: saved.contact || null });
  return saved;
}

// Resume from the review queue: a reviewer gave a contact, or chose to qualify an unsettled company.
export async function resumeCompany(id, { contact = null, emit = () => {} } = {}) {
  const company = await getCompany(id);
  if (!company) throw new Error('Company not found');
  if (!company.facts) company.facts = emptyFacts();
  if (!company.qualification) throw new Error('This company never reached qualification. Re-run it instead.');
  const t0 = Date.now();
  const log = (stage, entry) => company.trail.push({ stage, at: new Date().toISOString(), ...entry });
  const step = (n, state, note) => emit({ type: 'step', step: n, state, note });
  if (company.qualification.verdict === 'review') {
    company.qualification = { ...company.qualification, verdict: 'qualified', fit: company.qualification.fit ?? 0.4 };
    company.fit = company.qualification.fit;
  }
  log('review', { key: 'override', name: 'Reviewer resumed', result: 'pass', by: 'reviewer', note: contact ? 'contact provided' : 'qualified by reviewer' });
  try {
    return await fromContact(company, { emit, log, step, t0, contactOverride: contact });
  } catch (err) {
    log('error', { key: 'error', name: 'Pipeline error', result: 'fail', by: 'rule', note: err.message });
    return park(company, 'error', err.message, emit, t0);
  }
}

export { STAGES };
