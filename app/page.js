import Link from 'next/link';
import { listCompanies, listRuns, listEvents, listLearnings } from '@/lib/store';
import CompanyTable from '@/components/CompanyTable';
import { fmtDate, sumUsage, editRate } from '@/lib/ui';

export const dynamic = 'force-dynamic';

const STEPS = [
  ['Scrape', 'website signal'],
  ['Extract', 'facts + quotes'],
  ['Qualify', 'rules + agent loop'],
  ['Find PoC', 'Hunter + title rules'],
  ['Pain points', '2, evidence-linked'],
  ['Draft', 'validated email'],
  ['Send', 'auto, to your inbox'],
];

export default async function Overview({ searchParams }) {
  const runId = searchParams?.run ? Number(searchParams.run) : null;
  const [runs, all, events, learnings] = await Promise.all([
    listRuns(20),
    listCompanies(runId ? { runId } : {}),
    listEvents(12),
    listLearnings({ activeOnly: true }),
  ]);

  const by = (s) => all.filter((c) => c.status === s);
  const qualified = all.filter((c) => c.qualification && ['qualified', 'review'].includes(c.qualification.verdict));
  const reached = [
    all.length,
    all.filter((c) => c.pages?.length).length,
    all.filter((c) => c.qualification).length,
    all.filter((c) => (c.trail || []).some((t) => t.stage === 'contact')).length,
    all.filter((c) => c.draft).length,
    all.filter((c) => c.draft).length,
    by('sent').length,
  ];
  const sent = by('sent');
  const edits = sent.filter((c) => c.sent && c.draft?.original).map((c) => editRate(c.draft.original.body, c.sent.body));
  const avgEdit = edits.length ? edits.reduce((a, b) => a + b, 0) / edits.length : null;
  const researched = all.filter((c) => c.status !== 'running');
  const pagesPer = researched.length ? researched.reduce((a, c) => a + (c.pages?.filter((p) => !p.error).length || 0), 0) / researched.length : 0;
  const secsPer = researched.length ? researched.reduce((a, c) => a + (c.duration_ms || 0), 0) / researched.length / 1000 : 0;
  const tokens = all.reduce((a, c) => { const u = sumUsage(c.usage); return { calls: a.calls + u.calls, in: a.in + u.in, out: a.out + u.out }; }, { calls: 0, in: 0, out: 0 });
  const stageTokens = {};
  for (const c of all) for (const [k, u] of Object.entries(c.usage || {})) {
    stageTokens[k] = stageTokens[k] || { calls: 0, in: 0, out: 0 };
    stageTokens[k].calls += u.calls; stageTokens[k].in += u.in; stageTokens[k].out += u.out;
  }
  const dropReasons = {};
  for (const c of by('dropped')) {
    const g = (c.qualification?.gates || []).find((x) => x.result === 'fail');
    const key = g?.name || c.status_reason || 'other';
    (dropReasons[key] = dropReasons[key] || []).push(c);
  }

  return (
    <div className="page">
      <div className="eyebrow">{runId ? `Run #${runId}` : 'All runs'}</div>
      <div className="spread">
        <h1>Pipeline overview</h1>
        <form className="row">
          <select name="run" defaultValue={runId || ''} className="input" style={{ width: 'auto', padding: '6px 10px' }}>
            <option value="">All runs</option>
            {runs.map((r) => <option key={r.id} value={r.id}>Run #{r.id} · {fmtDate(r.created_at)} · {r.status}</option>)}
          </select>
          <button className="btn sm">Show</button>
        </form>
      </div>
      <p className="lede">A list of domains goes in. Each company is scraped, qualified by rules (with an agent loop that fetches more pages when facts are missing), matched to a decision-maker, and written to. Clean drafts send themselves to your inbox; anything the rules cannot settle waits for you.</p>

      <div className="grid g6">
        <Stat k="Researched" v={researched.length} s={`${runs.length} run(s)`} />
        <Stat k="Qualified" v={qualified.length} s={researched.length ? `${Math.round((qualified.length / researched.length) * 100)}% hit rate` : '—'} />
        <Stat k="Sent" v={sent.length} s="to your inbox" />
        <Stat k="Review" v={by('review').length + by('error').length} s="waiting on a human" />
        <Stat k="Drafts" v={by('draft').length} s="held for a check" />
        <Stat k="Dropped" v={by('dropped').length} s="a gate failed" />
      </div>

      <div className="card mt">
        <div className="card-head"><h2>Seven steps from a domain to an email in your inbox</h2><span className="muted small">companies that reached each step</span></div>
        <div className="strip flowstrip">
          <div className="flowline"><i /></div>
          {STEPS.map(([t, d], i) => (
            <div key={t} className="stepbox">
              <div className="n">STEP {i + 1}</div>
              <div className="t">{t}</div>
              <div className="d">{d}</div>
              <div className="c">{reached[i]}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid g2 mt">
        <Link href="/review" className="card card-pad">
          <div className="spread"><h2>Gate 1 · Review queue</h2><span className="badge b-review">{by('review').length + by('error').length} waiting</span></div>
          <p className="muted small" style={{ margin: '6px 0 0' }}>Companies the rules could not settle (unknown B2B status, no contact found, site unreachable). Nothing is guessed.</p>
        </Link>
        <Link href="/drafts" className="card card-pad">
          <div className="spread"><h2>Gate 2 · Drafts</h2><span className="badge b-draft">{by('draft').length} waiting</span></div>
          <p className="muted small" style={{ margin: '6px 0 0' }}>Drafts that failed a validator check or carry a flag. Clean, validated drafts skip this and go straight to your inbox.</p>
        </Link>
      </div>

      <div className="card mt">
        <div className="card-head"><h2>How the pipeline performed</h2><span className="muted small">the measures from the pre-build decisions</span></div>
        <div className="grid g6 card-pad">
          <Stat k="Time / company" v={secsPer ? `${Math.round(secsPer)}s` : '—'} s="baseline 15-20 min" bare />
          <Stat k="Pages / company" v={pagesPer.toFixed(1)} s="cap 7" bare />
          <Stat k="Avg edit rate" v={avgEdit === null ? '—' : `${Math.round(avgEdit * 100)}%`} s="target < 20%, kill > 50%" bare />
          <Stat k="Flag rate" v={researched.length ? `${Math.round((all.filter((c) => c.flags?.length).length / researched.length) * 100)}%` : '—'} s="qualified with a flag" bare />
          <Stat k="Gemini calls" v={tokens.calls} s={`${(tokens.in / 1000).toFixed(1)}k in · ${(tokens.out / 1000).toFixed(1)}k out`} bare />
          <Link href="/loop"><Stat k="Learnings" v={learnings.length} s="shape new drafts" bare /></Link>
        </div>
      </div>

      <div className="grid g3 mt">
        <div className="card">
          <div className="card-head"><h2>Why companies dropped</h2></div>
          <div className="card-pad">
            {Object.keys(dropReasons).length === 0 ? <div className="muted small">Nothing dropped yet.</div> :
              Object.entries(dropReasons).map(([k, list]) => (
                <div key={k} style={{ marginBottom: 10 }}>
                  <div className="spread"><b>{k}</b><span>{list.length}</span></div>
                  <div className="muted small">{list.slice(0, 4).map((c) => c.name).join(', ')}</div>
                </div>
              ))}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h2>Gemini tokens by stage</h2></div>
          <table className="t">
            <thead><tr><th>Stage</th><th>Calls</th><th>In</th><th>Out</th></tr></thead>
            <tbody>
              {Object.keys(stageTokens).length === 0 ? <tr><td colSpan={4} className="muted">No calls yet.</td></tr> :
                Object.entries(stageTokens).map(([k, u]) => <tr key={k}><td style={{ textTransform: 'capitalize' }}>{k}</td><td>{u.calls}</td><td>{u.in.toLocaleString()}</td><td>{u.out.toLocaleString()}</td></tr>)}
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className="card-head"><h2>Recent signals</h2><span className="muted small">for the feedback loop</span></div>
          <div className="card-pad">
            {events.length === 0 ? <div className="muted small">No sends, edits or overrides yet.</div> :
              events.map((e) => (
                <div key={e.id} style={{ marginBottom: 8 }}>
                  <div><b style={{ textTransform: 'capitalize' }}>{String(e.kind).replace(/_/g, ' ')}</b> · {e.company_id ? <Link className="src" href={`/companies/${e.company_id}`}>{e.company}</Link> : e.company}</div>
                  <div className="muted small">{e.actor} · {fmtDate(e.at)}{e.note ? ` · ${e.note}` : ''}</div>
                </div>
              ))}
          </div>
        </div>
      </div>

      <div className="card mt">
        <div className="card-head"><h2>Companies</h2><Link href="/companies" className="src">All companies →</Link></div>
        <CompanyTable companies={all.slice(0, 12)} />
      </div>
    </div>
  );
}

function Stat({ k, v, s, bare }) {
  return (
    <div className={bare ? 'stat' : 'card stat'} style={bare ? { padding: 0 } : null}>
      <div className="k">{k}</div>
      <div className="v">{v}</div>
      <div className="s">{s}</div>
    </div>
  );
}
