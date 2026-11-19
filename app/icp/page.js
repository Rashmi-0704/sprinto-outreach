import { STAGES, COMPETITORS, PRESSURE_SIGNALS, TITLE_RULES, LIMITS, HEADCOUNT_BAND, SPRINTO_FACTS } from '@/lib/config';

export const metadata = { title: 'ICP & evidence map · Sprinto Outreach' };

const MAP = [
  {
    q: 'Already on a compliance platform?',
    fact: 'Trust center or page HTML that points at Vanta, Drata, Secureframe, Thoropass, Scrut, or Sprinto itself',
    where: 'homepage HTML · /trust · /security',
    enough: 'a vendor domain string is present in the HTML',
    limit: 'crawl only',
    exit: 'treat as not on a platform',
    short: 'YES: drop and stop. They already bought the category.',
  },
  {
    q: 'B2B SaaS?',
    fact: 'A product description that names a business buyer',
    where: 'homepage hero · /product · /about',
    enough: 'is_b2b_saas is true or false, with a verified quote',
    limit: 'loop, up to 4 fetches shared',
    exit: 'review queue: a human confirms',
    short: 'NO: drop and stop.',
  },
  {
    q: 'Series A-C?',
    fact: `Funding stage named, or headcount ${HEADCOUNT_BAND.min}-${HEADCOUNT_BAND.max}, or 5+ open roles, or an Enterprise plan`,
    where: '/careers (job board API) · /about · /press · /pricing',
    enough: 'any one of these fields is filled',
    limit: 'loop, up to 4 fetches shared',
    exit: 'qualify at a lower rank, flagged: the draft waits for a human',
    short: 'Seed or Series D+/public: drop.',
  },
  {
    q: 'Frameworks left to get?',
    fact: 'Named certifications (SOC 2, ISO 27001) and whether each is held or in progress',
    where: 'homepage footer · /security · /trust',
    enough: 'any named certification string, or a trust page read with none',
    limit: '1 (trust page in the crawl)',
    exit: 'treat as not certified',
    short: 'Holds both SOC 2 and ISO 27001: drop.',
  },
  {
    q: 'A reason to act now?',
    fact: 'Audit in progress, compliance hiring, Enterprise plan, enterprise customers, regulated customers, SSO/SAML, or a buyer-facing security page',
    where: '/pricing · /security · /customers · /careers',
    enough: 'at least one pressure signal with a verified quote',
    limit: 'loop, up to 4 fetches shared',
    exit: 'drop: no why-now means a cold email has no hook',
    short: '—',
  },
];

export default function Icp() {
  return (
    <div className="page">
      <div className="eyebrow">The definition you defend</div>
      <h1>ICP & evidence map</h1>
      <p className="lede">
        The right company for Sprinto is a <b>B2B SaaS company at Series A-C</b> that is <b>not already on a compliance automation platform</b>, still has <b>SOC 2 or ISO 27001 left to get</b>, and shows <b>at least one reason to act now</b>: an audit in progress, compliance hiring, or enterprise buyers asking for proof.
        Each rule below is code in <code>lib/qualify.js</code>, reading values from <code>lib/config.js</code>. The model extracts facts; code decides.
      </p>

      <div className="card">
        <div className="card-head"><h2>Evidence map</h2><span className="muted small">worst case: {LIMITS.loopFetches} fetches beyond the first crawl, {LIMITS.maxPages} pages total</span></div>
        <table className="t">
          <thead><tr><th>Question</th><th>Fact that settles it</th><th>Where it lives</th><th>Sufficient when</th><th>Limit</th><th>If unanswered</th><th>Short-circuit</th></tr></thead>
          <tbody>{MAP.map((r) => <tr key={r.q}><td><b>{r.q}</b></td><td className="small">{r.fact}</td><td className="small mono">{r.where}</td><td className="small">{r.enough}</td><td className="small">{r.limit}</td><td className="small">{r.exit}</td><td className="small">{r.short}</td></tr>)}</tbody>
        </table>
      </div>

      <div className="grid g2 mt">
        <div className="card card-pad">
          <h2>Why these stages</h2>
          <table className="t mt"><tbody>{Object.entries(STAGES).map(([k, s]) => <tr key={k}><td><b>{s.label}</b></td><td>{s.fit === true ? <span className="badge b-pass">fit</span> : s.fit === false ? <span className="badge b-fail">drop</span> : <span className="badge b-unknown">proxy</span>}</td><td className="small">{s.why}</td></tr>)}</tbody></table>
        </div>
        <div className="card card-pad">
          <h2>Who gets the email</h2>
          <p className="muted small">Stage sets the title order; the first title Hunter (or your Apollo list) returns that matches wins. Early on the CTO or a founder owns the audit; later a security or compliance owner exists and is the better door.</p>
          <table className="t mt"><tbody>{Object.entries(TITLE_RULES).map(([k, list]) => <tr key={k}><td><b>{STAGES[k]?.label || 'Unknown stage'}</b></td><td className="small">{list.map((t, i) => `${i + 1}. ${t}`).join('  ')}</td></tr>)}</tbody></table>
        </div>
        <div className="card card-pad">
          <h2>Why-now signals</h2>
          <ul className="small">{Object.entries(PRESSURE_SIGNALS).map(([k, v]) => <li key={k}><code>{k}</code> {v}</li>)}</ul>
          <h3 className="mt">Competitors checked in page HTML</h3>
          <div className="small">{COMPETITORS.map((c) => c.name).join(' · ')}</div>
        </div>
        <div className="card card-pad">
          <h2>What the email may claim</h2>
          <p className="muted small">The writer only gets verbatim quotes from the prospect site and these product facts. The validator drops any number that is not in the evidence.</p>
          <ul className="small">{SPRINTO_FACTS.map((f) => <li key={f}>{f}</li>)}</ul>
        </div>
      </div>

      <div className="card card-pad mt">
        <h2>Pre-build decisions</h2>
        <dl className="kv mt">
          <dt>Outcome</dt><dd>Research and first draft in under 2 minutes per company (from 15-20), for Sprinto's Growth Lead, measured by time per company and edit rate.</dd>
          <dt>Baseline</dt><dd>8-15 companies a week, 15-20 minutes each, quality falls toward the end of the list.</dd>
          <dt>Workflow change</dt><dd>The Growth Lead gives a domain list and reviews what the rules could not settle, instead of researching and writing.</dd>
          <dt>Measurement</dt><dd>Time per company, edit rate under 20%, contact accuracy, reply rate once real sends begin.</dd>
          <dt>Kill criterion</dt><dd>Edit rate above 50%, or running it takes longer than it saves, or contact accuracy below 60%.</dd>
          <dt>Boundary</dt><dd>Every email goes to your own inbox (MY_EMAIL). No email reaches a real prospect from this build.</dd>
        </dl>
      </div>
    </div>
  );
}
