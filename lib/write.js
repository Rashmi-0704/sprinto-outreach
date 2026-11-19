// Steps 5 + 6: two pain points for this person, then the email. One Gemini call.
// Every pain point and the hook must cite a verified quote; a validator in code checks the draft.

import { gemini } from './gemini.js';
import { SPRINTO_FACTS, BANNED_PHRASES } from './config.js';
import { quoteFound } from './extract.js';

const ANGLES = {
  audit_in_progress: 'They are already working toward an audit (hiring for it or saying it is in progress). Help them get there faster and without a spreadsheet.',
  enterprise_pressure: 'They sell to enterprises, so security reviews and questionnaires are slowing deals. Help them turn security into a closing tool.',
  next_framework: 'They already hold one framework; the next one (or keeping both current) is the work. Help them reuse evidence across frameworks.',
  first_audit: 'They have no named certification yet but have a reason to need one soon. Help them make the first audit a non-event.',
};

const ROLE_LENS = {
  CTO: 'owns the engineering team whose time an audit eats',
  'VP Engineering': 'owns the engineering team whose time an audit eats',
  'Head of Security': 'owns security posture and every questionnaire that lands from sales',
  CISO: 'owns security posture and every questionnaire that lands from sales',
  'Head of Compliance': 'owns the audit calendar and evidence collection',
  CEO: 'feels stalled enterprise deals directly',
  'Co-founder': 'feels stalled enterprise deals directly and often owns the first audit',
};

const SENDER = process.env.SENDER_NAME || 'Rashmi';

const SYSTEM = `You write first-touch cold emails for Sprinto's Growth Lead. Sprinto sells compliance automation.
Write like a sharp peer, not a vendor: short, specific, plain words, no hype.
Rules you must follow:
- Use ONLY the evidence quotes given. Every pain point and the hook must copy one evidence quote exactly into "evidence_quote".
- Never invent numbers, customers, names, dates or events. Only numbers that appear in the evidence may be used.
- Greet the person by first name. Mention the company by name.
- Body: 70-130 words, 3 short paragraphs, plain text, no bullet points, no links, no emojis, no exclamation marks.
- First sentence is the hook: a specific observation about THEM, not about Sprinto. Put it in your own words about them ("they", "your team", the company name); never paste their first-person line ("we", "us", "our") into the email.
- One clear, low-friction question as the call to action. Do not ask for "a quick call".
- Subject: under 7 words, lowercase is fine, no clickbait, no exclamation marks.
- Sign off as "${SENDER}, Sprinto" on its own line.
Return JSON only.`;

export async function writeEmail({ company, facts, qualification, contact, learnings = [], revise = null }) {
  const evidence = [];
  const add = (label, f) => f?.quote && evidence.push({ label, quote: f.quote, url: f.url });
  add('what they sell', facts.what_they_sell);
  add('buyer', facts.buyer);
  add('funding', facts.funding_detail || facts.funding_stage);
  add('industry', facts.industry);
  for (const s of facts.pressure_signals || []) add(`signal: ${s.type}`, s);
  for (const r of facts.compliance_roles || []) add('open role', r);
  for (const c of facts.certifications || []) add(`certification ${c.status}`, c);
  for (const c of (facts.notable_customers || []).slice(0, 4)) add('customer', c);
  for (const n of (facts.recent_news || []).slice(0, 3)) add('news', n);
  const role = contact.canon || contact.title;

  const prompt = `PROSPECT
Company: ${company.name} (${company.domain})
Person: ${contact.first_name} ${contact.last_name || ''}, ${contact.title}${ROLE_LENS[contact.canon] ? ` - ${ROLE_LENS[contact.canon]}` : ''}
Certifications held: ${qualification.certsHeld?.join(', ') || 'none named'}; in progress: ${qualification.certsInProgress?.join(', ') || 'none named'}
Still to get: ${['SOC 2', 'ISO 27001'].filter((f) => !(qualification.certsHeld || []).includes(f)).join(', ') || 'none'} (never pitch a framework they already hold as if it were new)
Why they qualified: ${qualification.gates.filter((g) => g.result === 'pass').map((g) => `${g.name}: ${g.note || ''}`).join(' | ')}
Angle: ${ANGLES[qualification.angle]}

EVIDENCE (verbatim from their own site; the only facts you may use about them)
${evidence.map((e, i) => `E${i + 1} [${e.label}] "${e.quote}"`).join('\n')}

WHAT SPRINTO CAN TRUTHFULLY SAY
${SPRINTO_FACTS.map((f) => `- ${f}`).join('\n')}
${learnings.length ? `\nLESSONS FROM THE GROWTH LEAD'S PAST EDITS (follow these)\n${learnings.map((l) => `- ${l}`).join('\n')}\n` : ''}
${revise ? `\nYOUR PREVIOUS DRAFT FAILED THESE CHECKS. Fix every one:\n${revise.map((r) => `- ${r}`).join('\n')}\n` : ''}
TASK
1. Pick the two pain points this ${role} most likely has right now, each tied to one evidence quote.
2. Write the email around the stronger one. The hook must reference a specific fact from the evidence.
3. The body must say "${company.name}" at least once, spelled exactly like that.

Return:
{
  "pain_points": [{"title": "short name", "why": "one sentence: why this person feels it now", "evidence_quote": "exact quote from EVIDENCE"}, {...}],
  "hook": {"text": "the first sentence of the email", "evidence_quote": "exact quote from EVIDENCE"},
  "subject": "...",
  "body": "full email body including greeting and sign-off",
  "why_this_email": "two sentences a reviewer can read to see why it was written this way"
}`;

  const { data, usage } = await gemini({ prompt, system: SYSTEM, temperature: revise ? 0.3 : 0.5 });
  return { draft: normalize(data), evidence, usage };
}

function normalize(d) {
  return {
    pain_points: (d?.pain_points || []).slice(0, 2).map((p) => ({ title: String(p.title || ''), why: String(p.why || ''), evidence_quote: String(p.evidence_quote || '') })),
    hook: { text: String(d?.hook?.text || ''), evidence_quote: String(d?.hook?.evidence_quote || '') },
    subject: String(d?.subject || '').trim(),
    body: String(d?.body || '').replace(/\r/g, '').trim(),
    why_this_email: String(d?.why_this_email || ''),
  };
}

const words = (t) => (t.match(/\S+/g) || []).length;

// Returns a list of checks; any failure sends the draft to the human gate instead of the inbox.
export function validateDraft(draft, { contact, company, evidence }) {
  const evidenceText = evidence.map((e) => e.quote).join('\n');
  const checks = [];
  const check = (name, ok, note) => checks.push({ name, ok: Boolean(ok), note });
  const body = draft.body;
  const lower = body.toLowerCase();

  check('Greets by first name', new RegExp(`^(hi|hey|hello|dear)?\\s*${contact.first_name}\\b`, 'i').test(body.split('\n')[0].trim()), `first line: "${body.split('\n')[0].slice(0, 60)}"`);
  check('Names the company', lower.includes(company.name.toLowerCase()) || lower.includes(company.domain.split('.')[0]), company.name);
  const wc = words(body);
  check('Length 60-150 words', wc >= 60 && wc <= 150, `${wc} words`);
  check('Subject is short', draft.subject && words(draft.subject) <= 8 && !draft.subject.includes('!'), `"${draft.subject}"`);
  check('Two pain points, each with evidence', draft.pain_points.length === 2 && draft.pain_points.every((p) => quoteFound(p.evidence_quote, evidenceText)), draft.pain_points.map((p) => p.title).join(' / '));
  check('Hook cites real evidence', quoteFound(draft.hook.evidence_quote, evidenceText), `"${draft.hook.evidence_quote.slice(0, 80)}"`);
  check('Hook is in the email', draft.hook.text && quoteFound(draft.hook.text.slice(0, 60), body), 'first sentence matches the hook');
  // The opening line is about them, in our words. Their own "we/us/our" copied in reads as if they wrote it.
  const opening = body.split('\n').slice(1).join(' ').trim().split(/(?<=[.?])\s/)[0] || '';
  const firstPerson = opening.match(/\b(we|us|our|ours|we're|we've|we'll)\b/i);
  check('Hook in our words, not their first person', !firstPerson, firstPerson ? `opening says "${firstPerson[0]}": "${opening.slice(0, 70)}"` : 'written about them');
  const banned = BANNED_PHRASES.filter((p) => lower.includes(p));
  check('No filler phrases', banned.length === 0, banned.length ? banned.join(', ') : 'clean');
  check('No exclamation marks or links', !/[!]|https?:\/\//.test(body), '');
  // Numbers in the email must exist in the evidence (or be framework names like SOC 2 / 27001).
  const allowed = /^(2|1|27001|9001|42001|ii)$/i;
  const nums = (body.match(/\$?\d[\d,.]*\s?(%|m|k|million|billion)?/gi) || []).map((n) => n.trim());
  const unsupported = nums.filter((n) => !allowed.test(n.replace(/[^\dii]/gi, '')) && !evidenceText.includes(n.replace(/\s/g, '').replace(/^\$/, '')));
  check('No invented numbers', unsupported.length === 0, unsupported.length ? `not in evidence: ${unsupported.join(', ')}` : 'all numbers sourced');
  const questions = (body.match(/\?/g) || []).length;
  check('One clear question', questions >= 1 && questions <= 2, `${questions} question mark(s)`);

  return { ok: checks.every((c) => c.ok), checks };
}
