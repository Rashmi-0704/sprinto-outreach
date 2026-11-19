import Link from 'next/link';
import { listLearnings, listEvents, listCompanies } from '@/lib/store';
import { LearningToggle, AddLearning } from '@/components/Actions';
import { fmtDate, editRate } from '@/lib/ui';

export const dynamic = 'force-dynamic';

export default async function Loop() {
  const [learnings, events, all] = await Promise.all([listLearnings(), listEvents(60), listCompanies()]);
  const sent = all.filter((c) => c.status === 'sent' && c.draft?.original);
  const rates = sent.map((c) => editRate(c.draft.original.body, c.sent?.body));
  const avg = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null;
  const overrides = events.filter((e) => String(e.kind).startsWith('override'));
  const verdict = avg === null ? 'No sends yet' : avg > 0.5 ? 'Kill criterion hit: rewrites above 50%' : avg > 0.2 ? 'Above the 20% target: add lessons' : 'On target: under 20% rewritten';
  return (
    <div className="page">
      <div className="eyebrow">Learning</div>
      <h1>Feedback loop</h1>
      <p className="lede">Every edit, override and discard is recorded. Lessons you write become rules in the writer prompt for the next drafts. Edit rate is the measure from the pre-build decisions: under 20% rewritten is the target, above 50% is the kill criterion.</p>
      <div className="grid g3">
        <div className="card stat"><div className="k">Avg edit rate</div><div className="v">{avg === null ? '—' : `${Math.round(avg * 100)}%`}</div><div className="s">{verdict}</div></div>
        <div className="card stat"><div className="k">Overrides</div><div className="v">{overrides.length}</div><div className="s">rule decisions a human changed</div></div>
        <div className="card stat"><div className="k">Active lessons</div><div className="v">{learnings.filter((l) => l.active).length}</div><div className="s">in every new draft prompt</div></div>
      </div>
      <div className="card mt">
        <div className="card-head"><h2>Lessons for the writer</h2></div>
        <div className="card-pad">
          <AddLearning />
          {learnings.length === 0 ? <div className="muted small mt">No lessons yet. Add one here, or write one when you send or discard a draft.</div> : (
            <table className="t mt">
              <tbody>
                {learnings.map((l) => (
                  <tr key={l.id}><td style={{ opacity: l.active ? 1 : 0.5 }}>{l.text}<div className="sub">{fmtDate(l.created_at)}</div></td><td style={{ width: 110 }}><LearningToggle id={l.id} active={l.active} /></td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <div className="card mt">
        <div className="card-head"><h2>Signals</h2></div>
        {events.length === 0 ? <div className="empty">Nothing recorded yet.</div> : (
          <table className="t">
            <thead><tr><th>What</th><th>Company</th><th>Who</th><th>Note</th><th>When</th></tr></thead>
            <tbody>{events.map((e) => (
              <tr key={e.id}><td style={{ textTransform: 'capitalize' }}>{String(e.kind).replace(/_/g, ' ')}</td><td>{e.company_id ? <Link className="src" href={`/companies/${e.company_id}`}>{e.company}</Link> : '—'}</td><td>{e.actor}</td><td className="small">{e.note || '—'}</td><td className="small">{fmtDate(e.at)}</td></tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
