// The ICP, written down as data. Every gate in qualify.js reads from here, so the definition
// of "right company" lives in one place and can be defended line by line.

export const LIMITS = {
  // Pages the agent loop may fetch beyond the first crawl (homepage + any trust/careers page found on it).
  loopFetches: 4,
  // Hard ceiling on pages per company, crawl + loop together.
  maxPages: 7,
  // Cleaned text kept per page (~2,000 tokens at ~4 chars a token).
  charsPerPage: 8000,
  // A page with fewer words than this is treated as a JS shell and re-read through a renderer.
  thinPageWords: 150,
  fetchTimeoutMs: 12000,
};

// Stages Sprinto sells to. Seed is usually too early (no enterprise deal forcing an audit yet);
// Series D+ and public companies usually run their own GRC team.
export const STAGES = {
  pre_seed: { label: 'Pre-seed', fit: false, why: 'too early: no enterprise deals forcing an audit yet' },
  seed: { label: 'Seed', fit: false, why: 'too early: no enterprise deals forcing an audit yet' },
  series_a: { label: 'Series A', fit: true, why: 'first enterprise deals start asking for SOC 2' },
  series_b: { label: 'Series B', fit: true, why: 'moving upmarket; security reviews block deals' },
  series_c: { label: 'Series C', fit: true, why: 'multiple frameworks and audits to keep up with' },
  series_d_plus: { label: 'Series D+', fit: false, why: 'likely has an in-house GRC team and tooling' },
  public: { label: 'Public', fit: false, why: 'in-house GRC team and tooling' },
  bootstrapped: { label: 'Bootstrapped', fit: null, why: 'stage unclear; judged on size and pressure instead' },
};

// Headcount band that stands in for Series A-C when the stage is not published.
export const HEADCOUNT_BAND = { min: 20, max: 600 };

// Compliance automation vendors. If a prospect's trust center runs on one, they already bought the category.
export const COMPETITORS = [
  { name: 'Vanta', patterns: ['vanta.com', 'trust.vanta', 'vantatrust'] },
  { name: 'Drata', patterns: ['drata.com', 'trust.drata'] },
  { name: 'Secureframe', patterns: ['secureframe.com'] },
  { name: 'Thoropass', patterns: ['thoropass.com', 'laika.app'] },
  { name: 'Scrut', patterns: ['scrut.io'] },
  { name: 'Sprinto', patterns: ['sprinto.com'], customer: true },
];

// Frameworks Sprinto automates. Holding all of the "core" ones means there is little left to sell.
export const FRAMEWORKS = [
  { key: 'SOC 2', re: /\bSOC[\s-]?2\b|\bSOC[\s-]?II\b/i, core: true },
  { key: 'ISO 27001', re: /\bISO[\s/-]?(IEC[\s-]?)?27001\b/i, core: true },
  { key: 'HIPAA', re: /\bHIPAA\b/i },
  { key: 'GDPR', re: /\bGDPR\b/i },
  { key: 'PCI DSS', re: /\bPCI[\s-]?DSS\b/i },
];

// "Why now" signals. The ICP asks for a company preparing for an audit or under enterprise pressure.
export const PRESSURE_SIGNALS = {
  enterprise_tier: 'Sells an Enterprise plan',
  enterprise_customers: 'Names enterprise customers',
  regulated_industry: 'Sells into a regulated industry (finance, health, insurance, government)',
  security_page: 'Has a security / trust page aimed at buyers',
  sso_saml: 'Offers SSO / SAML / audit logs (enterprise checklist features)',
  compliance_hiring: 'Hiring for security, GRC or compliance',
  audit_in_progress: 'Says a certification is in progress',
};

// Who to email, by stage. First match wins. Earlier stages: the founder/CTO owns the audit.
// Later stages: a security or compliance owner exists and is the better door.
export const TITLE_RULES = {
  series_a: ['CTO', 'Co-founder', 'CEO', 'VP Engineering', 'Head of Security'],
  series_b: ['CTO', 'Head of Security', 'VP Engineering', 'Head of Compliance', 'Co-founder', 'CEO'],
  series_c: ['CISO', 'Head of Security', 'Head of Compliance', 'VP Engineering', 'CTO'],
  default: ['CTO', 'Head of Security', 'VP Engineering', 'Co-founder', 'CEO'],
};

// Title text -> canonical role. Checked in order, so specific patterns come first.
export const TITLE_ALIASES = [
  ['CISO', /\bciso\b|chief information security/i],
  ['Head of Compliance', /(head|director|vp|lead|manager).{0,20}(compliance|grc|risk|governance)|compliance (lead|manager|officer)/i],
  ['Head of Security', /(head|director|vp|lead|manager).{0,20}(security|infosec)|security (lead|officer)/i],
  ['CTO', /\bcto\b|chief technology|chief technical/i],
  ['VP Engineering', /(vp|vice president|head|director|svp).{0,15}engineering/i],
  ['Co-founder', /co-?founder|\bfounder\b/i],
  ['CEO', /\bceo\b|chief executive/i],
];

// What Sprinto can truthfully claim in an email. The writer may only use these product facts.
export const SPRINTO_FACTS = [
  'Sprinto automates SOC 2, ISO 27001, GDPR, HIPAA and other frameworks on one platform',
  'It connects to cloud, HR and code tools and collects audit evidence automatically',
  'It monitors controls continuously, so the company stays audit-ready between audits',
  'It works with a network of auditors, so the audit itself is not a separate project',
  'It helps answer enterprise security questionnaires faster with a trust center',
];

export const BANNED_PHRASES = [
  'hope this email finds you',
  'hope you are doing well',
  'i hope you\'re well',
  'revolutionize',
  'game-changer',
  'game changer',
  'synergy',
  'touch base',
  'circle back',
  'just following up',
  'leverage cutting-edge',
  'world-class',
  'quick call',
];

// Page paths the loop can try, per question. The model picks among real links; this is the fallback ladder.
export const SOURCE_LADDER = {
  is_b2b_saas: ['/product', '/about', '/platform', '/solutions'],
  funding_stage: ['/careers', '/about', '/company', '/press', '/news', '/blog'],
  pressure: ['/pricing', '/security', '/trust', '/customers', '/enterprise', '/careers'],
  certifications: ['/security', '/trust', '/compliance', '/legal/security'],
};
