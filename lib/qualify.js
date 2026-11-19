// Step 3: qualify. Code decides from named fields; the model only picks which page to read next.
// Evidence map: each question has a fact that settles it, a page where it lives, a fetch budget,
// and an exit (drop, flag, or hand to a human) when it stays unanswered.

import { STAGES, HEADCOUNT_BAND, FRAMEWORKS, SOURCE_LADDER, LIMITS } from './config.js';
import { gemini } from './gemini.js';

const HOLD_WORDS = /(certified|certification|compliant|compliance|type\s?(ii|2|i|1)\b|attest|audited|report|accredited)/i;
const REGULATED = /(bank|financ|fintech|lending|insur|health|hospital|clinic|pharma|medical|patient|government|public sector|defen[cs]e|payments?)/i;

function gate(key, name, result, note, evidence) {
  return { key, name, result, note, quote: evidence?.quote || null, url: evidence?.url || null, by: evidence?.by || 'rule' };
}

export function certificationsHeld(facts, ruleSignals) {
  const held = new Map();
  const inProgress = new Map();
  for (const c of facts.certifications || []) {
    const key = FRAMEWORKS.find((f) => f.re.test(c.name))?.key || c.name;
    (c.status === 'in_progress' ? inProgress : held).set(key, c);
  }
  for (const f of ruleSignals.frameworks || []) {
    if (!held.has(f.name) && !inProgress.has(f.name) && HOLD_WORDS.test(f.quote) && !/(in progress|working towards|pursuing|coming soon|underway)/i.test(f.quote)) {
      held.set(f.name, { name: f.name, quote: f.quote, url: f.url, by: 'rule' });
    }
    if (/(in progress|working towards|pursuing|coming soon|underway)/i.test(f.quote) && !held.has(f.name)) {
      inProgress.set(f.name, { name: f.name, quote: f.quote, url: f.url, by: 'rule' });
    }
  }
  return { held, inProgress };
}

export function pressureSignals(facts, certs) {
  const out = [];
  for (const s of facts.pressure_signals || []) out.push({ type: s.type, detail: s.detail, quote: s.quote, url: s.url });
  for (const r of facts.compliance_roles || []) out.push({ type: 'compliance_hiring', detail: `Hiring: ${r.title}`, quote: r.quote, url: r.url });
  for (const [name, c] of certs.inProgress) out.push({ type: 'audit_in_progress', detail: `${name} in progress`, quote: c.quote, url: c.url });
  if (facts.industry && REGULATED.test(facts.industry.value) && !out.some((s) => s.type === 'regulated_industry')) {
    out.push({ type: 'regulated_industry', detail: `Customers in ${facts.industry.value}`, quote: facts.industry.quote, url: facts.industry.url });
  }
  return out;
}

// facts: verified facts. ctx: { ruleSignals, hint (stage from input), pagesRead, loopDone }
export function evaluate(facts, ctx) {
  const gates = [];
  const missing = [];
  const flags = [];
  const { ruleSignals, hint, loopDone } = ctx;

  // G1. Already bought the category? Short-circuit.
  const comp = (ruleSignals.competitors || [])[0];
  if (comp) {
    gates.push(
      gate('competitor', 'Not already on a compliance platform', 'fail', comp.customer ? `already a Sprinto customer (found '${comp.evidence}' in page HTML)` : `trust center runs on ${comp.name} (found '${comp.evidence}' in page HTML)`, { url: comp.url }),
    );
    return finish({ gates, missing, flags, verdict: 'dropped', reason: gates[0].note });
  }
  gates.push(gate('competitor', 'Not already on a compliance platform', 'pass', 'no Vanta, Drata, Secureframe, Thoropass, Scrut or Sprinto found in page HTML'));

  // G2. B2B SaaS?
  const saas = facts.is_b2b_saas;
  if (saas?.value === true) gates.push(gate('saas', 'Sells B2B SaaS', 'pass', facts.buyer ? `buyer: ${facts.buyer.value}` : null, saas));
  else if (saas?.value === false) {
    gates.push(gate('saas', 'Sells B2B SaaS', 'fail', 'not software sold to businesses', saas));
    return finish({ gates, missing, flags, verdict: 'dropped', reason: 'not B2B SaaS' });
  } else {
    gates.push(gate('saas', 'Sells B2B SaaS', 'unknown', 'pages read do not say who buys it'));
    missing.push('is_b2b_saas');
  }

  // G3. Stage A-C (or a proxy for it)
  const stage = facts.funding_stage?.value || hint?.stage || null;
  const stageEv = facts.funding_stage || (hint?.stage ? { quote: `given in run input: ${hint.raw}`, by: 'input' } : null);
  const employees = facts.employee_count?.value;
  const roles = facts.open_roles_count?.value ?? ctx.jobCount ?? null;
  const hasEnterpriseTier = (facts.pressure_signals || []).some((s) => s.type === 'enterprise_tier');
  if (stage && STAGES[stage]?.fit === true) {
    gates.push(gate('stage', 'Series A-C', 'pass', STAGES[stage].why, stageEv));
  } else if (stage && STAGES[stage]?.fit === false) {
    gates.push(gate('stage', 'Series A-C', 'fail', `${STAGES[stage].label}: ${STAGES[stage].why}`, stageEv));
    return finish({ gates, missing, flags, verdict: 'dropped', reason: `stage: ${STAGES[stage].label}` });
  } else if (employees && employees > 2000) {
    gates.push(gate('stage', 'Series A-C', 'fail', `${employees} employees: too large, likely has in-house GRC`, facts.employee_count));
    return finish({ gates, missing, flags, verdict: 'dropped', reason: 'too large' });
  } else if (employees && employees >= HEADCOUNT_BAND.min && employees <= HEADCOUNT_BAND.max) {
    gates.push(gate('stage', 'Series A-C', 'pass', `stage not published; ${employees} employees fits the Series A-C band (${HEADCOUNT_BAND.min}-${HEADCOUNT_BAND.max})`, facts.employee_count));
    flags.push('stage inferred from headcount');
  } else if (roles !== null && roles >= 5) {
    gates.push(gate('stage', 'Series A-C', 'pass', `stage not published; ${roles} open roles suggests a funded, growing company`, facts.open_roles_count || { quote: `OPEN ROLES TOTAL: ${roles}`, url: ctx.jobUrl }));
    flags.push('stage inferred from hiring');
  } else if (hasEnterpriseTier && loopDone) {
    gates.push(gate('stage', 'Series A-C', 'pass', 'stage not published; sells an Enterprise plan, so it is past seed', (facts.pressure_signals || []).find((s) => s.type === 'enterprise_tier')));
    flags.push('stage inferred from pricing');
  } else {
    gates.push(gate('stage', 'Series A-C', 'unknown', 'no funding stage, headcount or hiring volume on pages read'));
    missing.push('funding_stage');
  }

  // G4. Frameworks left to sell
  const certs = certificationsHeld(facts, ruleSignals);
  const heldCore = FRAMEWORKS.filter((f) => f.core && certs.held.has(f.key)).map((f) => f.key);
  const firstHeld = [...certs.held.values()][0];
  if (heldCore.length === FRAMEWORKS.filter((f) => f.core).length) {
    gates.push(gate('coverage', 'Has frameworks left to get', 'fail', `already holds ${heldCore.join(' and ')}`, firstHeld));
    return finish({ gates, missing, flags, verdict: 'dropped', reason: `already holds ${heldCore.join(' + ')}` });
  }
  if (certs.held.size === 0 && !ctx.trustRead && !loopDone) missing.push('certifications');
  gates.push(
    gate(
      'coverage',
      'Has frameworks left to get',
      'pass',
      certs.held.size ? `holds ${[...certs.held.keys()].join(', ')}; still missing ${FRAMEWORKS.filter((f) => f.core && !certs.held.has(f.key)).map((f) => f.key).join(', ')}` : ctx.trustRead ? 'no certification named on the trust/security page' : 'no certification named on pages read',
      firstHeld,
    ),
  );

  // G5. Why now: audit prep or enterprise pressure
  const pressure = pressureSignals(facts, certs);
  if (pressure.length) {
    const types = [...new Set(pressure.map((p) => p.type))];
    gates.push(gate('pressure', 'Has a reason to act now', 'pass', `${pressure.length} signal(s): ${types.join(', ')}`, pressure[0]));
  } else if (!loopDone) {
    gates.push(gate('pressure', 'Has a reason to act now', 'unknown', 'no audit or enterprise-pressure signal yet'));
    missing.push('pressure');
  } else {
    gates.push(gate('pressure', 'Has a reason to act now', 'fail', `no audit or enterprise-pressure signal in ${ctx.pagesRead} pages read`));
    return finish({ gates, missing: [], flags, verdict: 'dropped', reason: 'no why-now signal' });
  }

  // Verdict
  if (missing.length && !loopDone) return finish({ gates, missing, flags, verdict: 'needs_info', certs, pressure, stage });
  if (missing.includes('is_b2b_saas')) {
    flags.push('B2B SaaS status unknown after loop');
    return finish({ gates, missing, flags, verdict: 'review', reason: 'could not confirm B2B SaaS', certs, pressure, stage });
  }
  if (missing.includes('funding_stage')) flags.push('stage unknown after loop: qualified at a lower rank');
  return finish({ gates, missing, flags, verdict: 'qualified', certs, pressure, stage });
}

function finish(r) {
  if (r.verdict !== 'qualified' && r.verdict !== 'review') return { ...r, fit: null, angle: null };
  const types = new Set((r.pressure || []).map((p) => p.type));
  let fit = 0.4;
  fit += Math.min(0.3, types.size * 0.1);
  if (types.has('compliance_hiring') || types.has('audit_in_progress')) fit += 0.15;
  if (r.stage && STAGES[r.stage]?.fit) fit += 0.1;
  if (r.certs && r.certs.held.size === 0) fit += 0.05;
  fit -= 0.1 * r.flags.length;
  fit = Math.max(0, Math.min(1, Math.round(fit * 100) / 100));

  let angle = 'first_audit';
  if (types.has('audit_in_progress') || types.has('compliance_hiring')) angle = 'audit_in_progress';
  else if (r.certs?.held.size) angle = 'next_framework';
  else if (types.has('enterprise_tier') || types.has('enterprise_customers') || types.has('sso_saml')) angle = 'enterprise_pressure';
  return {
    ...r,
    fit,
    angle,
    certsHeld: r.certs ? [...r.certs.held.keys()] : [],
    certsInProgress: r.certs ? [...r.certs.inProgress.keys()] : [],
  };
}

// The loop's one model decision: which real link answers the open questions best.
export async function chooseNextPage({ missing, links, fetched, domain }) {
  const fetchedSet = new Set(fetched.map((u) => u.replace(/\/$/, '')));
  const candidates = links
    .filter((l) => l.internal && !fetchedSet.has(l.href) && !/\.(pdf|png|jpg|zip)$/i.test(l.href) && !/(login|signin|sign-in|signup|register|privacy|terms|cookie|legal\/terms)/i.test(l.href))
    .slice(0, 80);

  const questions = {
    is_b2b_saas: 'Is this B2B SaaS, and who buys it?',
    funding_stage: 'What funding stage are they at (or headcount / number of open roles)?',
    pressure: 'Is there an audit or enterprise-customer pressure signal (enterprise plan, security page, compliance hiring, regulated customers)?',
    certifications: 'Which security certifications do they already hold?',
  };

  if (candidates.length) {
    try {
      const { data, usage } = await gemini({
        system: 'You pick the single web page most likely to answer open research questions. Return JSON only.',
        prompt: `Company: ${domain}\nOpen questions:\n${missing.map((m) => `- ${questions[m]}`).join('\n')}\n\nLinks on their site (url | link text):\n${candidates.map((l) => `${l.href} | ${l.text}`).join('\n')}\n\nReturn {"url": one url from the list, "answers": [question keys from ${JSON.stringify(missing)}], "why": "one short sentence"}`,
        temperature: 0,
      });
      const pick = candidates.find((c) => c.href === String(data?.url || '').replace(/\/$/, ''));
      if (pick) return { url: pick.href, why: data.why || 'model pick', by: 'agent', usage };
    } catch {
      /* fall through to the ladder */
    }
  }

  // Fallback: fixed ladder of likely paths for the first open question.
  for (const q of missing) {
    for (const path of SOURCE_LADDER[q] || []) {
      const url = `https://${domain}${path}`;
      if (!fetchedSet.has(url)) return { url, why: `ladder: ${path} usually answers "${questions[q]}"`, by: 'rule' };
    }
  }
  return null;
}

export const loopBudget = LIMITS.loopFetches;
