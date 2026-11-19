'use client';
import { useState, useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

const GROUPS = [
  ['scrape', 'Step 1 · Scrape'],
  ['extract', 'Step 2 · Extract'],
  ['loop', 'Step 3 · Agent loop'],
  ['qualify', 'Step 3 · Qualify gates'],
  ['contact', 'Step 4 · Point of contact'],
  ['pain', 'Step 5 · Pain points'],
  ['draft', 'Step 6 · Draft'],
  ['send', 'Step 7 · Send'],
  ['review', 'Human gate'],
  ['error', 'Errors'],
];

const FACT_LABEL = {
  company_name: 'Company name',
  what_they_sell: 'What they sell',
  buyer: 'Who buys it',
  is_b2b_saas: 'B2B SaaS',
  funding_stage: 'Funding stage',
  funding_detail: 'Funding detail',
  employee_count: 'Employees',
  industry: 'Customer industry',
  open_roles_count: 'Open roles',
};

function host(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '') + (u.pathname.length > 1 ? u.pathname : '');
  } catch {
    return url;
  }
}

function Row({ e }) {
  return (
    <div className="trow">
      <div><span className={`badge b-${e.result}`}>{{ pass: 'Pass', fail: 'Fail', unknown: 'Unknown', info: 'Info' }[e.result] || e.result}</span></div>
      <div>
        <span className="name">{e.name}</span>
        <span className="meta"><span className={`badge b-${e.by}`} style={{ fontSize: 10.5 }}>{e.by}</span></span>
        {e.quote && <div className="quote">“{e.quote}”</div>}
        {e.note && <div className="note">{e.note}</div>}
        {e.url && <a className="src" href={e.url} target="_blank" rel="noreferrer">{host(e.url)} ↗</a>}
      </div>
    </div>
  );
}

export default function CompanyTabs({ company: c }) {
  const [tab, setTab] = useState('trail');
  const wrap = useRef(null);
  // On tab change: the panel fades up and its rows (trail steps, facts) cascade in.
  useGSAP(() => {
    if (!wrap.current || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const panel = wrap.current.querySelectorAll(':scope > .card, :scope > .grid, :scope > div:not(.tabs)');
    gsap.from(panel, { y: 12, opacity: 0, duration: 0.4, stagger: 0.05, ease: 'power3.out', clearProps: 'transform,opacity' });
    const rows = wrap.current.querySelectorAll('.trow');
    if (rows.length) gsap.from(rows, { x: -10, opacity: 0, duration: 0.3, stagger: Math.min(0.03, 0.6 / rows.length), ease: 'power2.out', delay: 0.08, clearProps: 'transform,opacity' });
    const ink = wrap.current.querySelector('.tabs button.on');
    if (ink) gsap.fromTo(ink, { scale: 0.96 }, { scale: 1, duration: 0.35, ease: 'back.out(2)', clearProps: 'transform' });
  }, { dependencies: [tab], scope: wrap, revertOnUpdate: true });
  const trail = c.trail || [];
  const f = c.facts || {};
  const tabs = [
    ['trail', `Decision trail (${trail.length})`],
    ['research', 'Research'],
    ['contact', 'Contact'],
    ['email', c.draft ? 'Email (1)' : 'Email'],
  ];
  return (
    <div ref={wrap}>
      <div className="tabs">{tabs.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>

      {tab === 'trail' && (
        <div className="card card-pad">
          {trail.length === 0 && <div className="muted">No steps recorded.</div>}
          {GROUPS.map(([k, label]) => {
            const rows = trail.filter((t) => t.stage === k);
            if (!rows.length) return null;
            return (
              <div key={k} className="trail-group">
                <h4>{label}</h4>
                {rows.map((e, i) => <Row key={i} e={e} />)}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'research' && (
        <div className="grid" style={{ gap: 16 }}>
          <div className="card">
            <div className="card-head"><h2>Verified facts</h2><span className="muted small">each quote was found on the page it cites</span></div>
            <table className="t">
              <thead><tr><th>Field</th><th>Value</th><th>Quote</th></tr></thead>
              <tbody>
                {Object.entries(FACT_LABEL).map(([k, label]) => (
                  <tr key={k}>
                    <td className="small"><b>{label}</b></td>
                    <td className="small">{f[k] ? String(f[k].value) : <span className="muted">not stated</span>}</td>
                    <td className="small">{f[k]?.quote ? <>“{f[k].quote}” {f[k].url && <a className="src" href={f[k].url} target="_blank" rel="noreferrer">↗</a>}</> : ''}</td>
                  </tr>
                ))}
                {[['certifications', 'Certification', (x) => `${x.name} (${x.status})`], ['pressure_signals', 'Pressure signal', (x) => x.type.replace(/_/g, ' ')], ['compliance_roles', 'Compliance role', (x) => x.title], ['notable_customers', 'Customer', (x) => x.name], ['recent_news', 'News', (x) => x.detail]].flatMap(([k, label, val]) =>
                  (f[k] || []).map((x, i) => (
                    <tr key={k + i}>
                      <td className="small"><b>{label}</b></td>
                      <td className="small">{val(x)}</td>
                      <td className="small">“{x.quote}” {x.url && <a className="src" href={x.url} target="_blank" rel="noreferrer">↗</a>}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
          {f.rejected?.length > 0 && (
            <div className="card card-pad">
              <h2>Discarded by the quote check ({f.rejected.length})</h2>
              <p className="muted small">The model stated these, but the quote was not on any page read, so code threw them away.</p>
              {f.rejected.map((r, i) => <div key={i} className="small" style={{ marginTop: 6 }}><b>{r.field}</b>: {String(r.value)} {r.quote && <span className="muted">— “{r.quote}”</span>}</div>)}
            </div>
          )}
          <div className="card">
            <div className="card-head"><h2>Pages read ({(c.pages || []).length})</h2><span className="muted small">cleaned text the model saw</span></div>
            <div className="card-pad">
              {(c.pages || []).map((p, i) => (
                <details key={i} style={{ marginBottom: 10 }}>
                  <summary className="small" style={{ cursor: 'pointer' }}>
                    <b>{p.id}</b> · <a className="src" href={p.url} target="_blank" rel="noreferrer">{host(p.url)}</a> · {p.error ? <span className="badge b-fail">{p.error}</span> : <span className="muted">{p.method} · {p.words} words</span>}
                  </summary>
                  {p.text && <div className="pre" style={{ marginTop: 6 }}>{p.text}</div>}
                </details>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'contact' && (
        <div className="card card-pad">
          {c.contact ? (
            <>
              <h2>{c.contact.first_name} {c.contact.last_name}</h2>
              <dl className="kv mt">
                <dt>Title</dt><dd>{c.contact.title}{c.contact.canon ? <span className="muted"> → matched as {c.contact.canon}</span> : null}</dd>
                <dt>Email</dt><dd className="mono">{c.contact.email}</dd>
                <dt>Source</dt><dd>{c.contact.source}{c.contact.confidence ? ` · confidence ${c.contact.confidence}` : ''}</dd>
                {c.contact.linkedin && <><dt>LinkedIn</dt><dd><a className="src" href={c.contact.linkedin} target="_blank" rel="noreferrer">{c.contact.linkedin}</a></dd></>}
              </dl>
              <div className="trail-group mt">
                <h4>Why this person</h4>
                {trail.filter((t) => t.stage === 'contact').map((e, i) => <Row key={i} e={e} />)}
              </div>
            </>
          ) : <div className="muted">No contact chosen{c.status === 'dropped' ? ': the company did not qualify.' : '.'}</div>}
        </div>
      )}

      {tab === 'email' && (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: 16 }}>
          <div className="card card-pad">
            {c.draft ? (
              <>
                <div className="spread"><h2>{c.sent ? 'Sent email' : 'Draft'}</h2>{c.sent && <span className="badge b-sent">sent {c.sent.auto ? 'automatically' : 'by reviewer'} · {new Date(c.sent.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</span>}</div>
                <div className="email mt">
                  <div className="hdr">To: <b>{c.sent?.to || 'your inbox'}</b> · intended for {c.contact?.first_name} &lt;{c.contact?.email}&gt;</div>
                  <div className="hdr"><b>{c.sent?.subject || c.draft.subject}</b></div>
                  <pre>{c.sent?.body || c.draft.body}</pre>
                </div>
                {c.sent && c.sent.edit_rate !== undefined && <div className="muted small mt">Edit rate before sending: {Math.round(c.sent.edit_rate * 100)}%</div>}
                <h3 className="mt">Why it was written this way</h3>
                <p className="note">{c.draft.why_this_email}</p>
                <div className="quote">Hook: “{c.draft.hook?.text}”<br /><span className="small">evidence: “{c.draft.hook?.evidence_quote}”</span></div>
              </>
            ) : <div className="muted">No email: the pipeline stopped before step 6.</div>}
          </div>
          {c.draft && (
            <div className="grid" style={{ gap: 16, alignContent: 'start' }}>
              <div className="card card-pad">
                <h2>Two pain points</h2>
                {c.draft.pain_points.map((p, i) => (
                  <div key={i} className="mt">
                    <b>{i + 1}. {p.title}</b>
                    <div className="note">{p.why}</div>
                    <div className="quote small">“{p.evidence_quote}”</div>
                  </div>
                ))}
              </div>
              <div className="card card-pad">
                <div className="spread"><h2>Validator</h2><span className={`badge b-${c.draft.validation.ok ? 'pass' : 'fail'}`}>{c.draft.validation.checks.filter((x) => x.ok).length}/{c.draft.validation.checks.length}</span></div>
                <div className="mt" style={{ display: 'grid', gap: 6 }}>
                  {c.draft.validation.checks.map((x) => (
                    <div key={x.name} className={`check ${x.ok ? 'ok' : 'no'}`}><span className="ic">{x.ok ? '✓' : '✗'}</span><span><b>{x.name}</b>{x.note ? <span className="muted"> · {x.note}</span> : null}</span></div>
                  ))}
                </div>
                {c.draft.learnings_used > 0 && <div className="muted small mt">{c.draft.learnings_used} lesson(s) from the feedback loop were in the prompt.</div>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
