import Link from 'next/link';
import { listCompanies, getCompany } from '@/lib/store';
import { DraftEditor } from '@/components/Actions';
import { gmailConfigured } from '@/lib/send';
import { fmtDate, editRate } from '@/lib/ui';

export const dynamic = 'force-dynamic';

export default async function Drafts() {
  const all = await listCompanies();
  const waiting = await Promise.all(all.filter((c) => c.status === 'draft').map((c) => getCompany(c.id)));
  const sent = all.filter((c) => c.status === 'sent');
  const to = process.env.MY_EMAIL || 'MY_EMAIL (not set)';
  return (
    <div className="page">
      <div className="eyebrow">Human gate 2</div>
      <h1>Drafts & sends</h1>
      <p className="lede">Drafts land here only when a validator check failed, the company carries a flag, or auto-send is off. Edit if you need to and send. The edit rate and any lesson you write feed the next drafts.</p>
      {waiting.length === 0 && <div className="card empty">No drafts waiting. Clean drafts went straight to your inbox.</div>}
      <div className="grid">
        {waiting.map((c) => (
          <div key={c.id} id={`c${c.id}`} className="card card-pad">
            <div className="spread">
              <div><Link href={`/companies/${c.id}`}><h2 style={{ display: 'inline' }}>{c.name}</h2></Link> <span className="muted">→ {c.contact.first_name} {c.contact.last_name} · {c.contact.title}</span></div>
              <span className="badge b-draft" style={{ whiteSpace: 'normal' }}>{c.status_reason}</span>
            </div>
            <div className="grid mt" style={{ gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)' }}>
              <DraftEditor id={c.id} subject={c.draft.subject} body={c.draft.body} to={to} gmailReady={gmailConfigured()} />
              <div>
                <h3>Validator</h3>
                {c.draft.validation.checks.map((x) => (
                  <div key={x.name} className={`check ${x.ok ? 'ok' : 'no'}`} style={{ marginBottom: 4 }}><span className="ic">{x.ok ? '✓' : '✗'}</span><span><b>{x.name}</b>{x.note ? <span className="muted"> · {x.note}</span> : null}</span></div>
                ))}
                <h3 className="mt">Pain points</h3>
                {c.draft.pain_points.map((p, i) => <div key={i} className="small" style={{ marginBottom: 6 }}><b>{p.title}</b> · {p.why}<div className="quote small">“{p.evidence_quote}”</div></div>)}
                {c.flags?.length > 0 && <><h3 className="mt">Flags</h3><div className="small">{c.flags.join(' · ')}</div></>}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card mt2">
        <div className="card-head"><h2>Sent ({sent.length})</h2><span className="muted small">all to {to}</span></div>
        {sent.length === 0 ? <div className="empty">Nothing sent yet.</div> : (
          <table className="t">
            <thead><tr><th>Company</th><th>Intended for</th><th>Subject</th><th>How</th><th>Edit rate</th><th>When</th></tr></thead>
            <tbody>
              {sent.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/companies/${c.id}`}><b>{c.name}</b></Link></td>
                  <td className="small">{c.contact?.first_name} {c.contact?.last_name}<div className="sub">{c.contact?.title}</div></td>
                  <td className="small">{c.sent?.subject}</td>
                  <td>{c.sent?.auto ? <span className="badge b-info">auto</span> : <span className="badge b-reviewer">reviewer</span>}</td>
                  <td className="mono">{c.draft?.original ? `${Math.round(editRate(c.draft.original.body, c.sent?.body) * 100)}%` : '—'}</td>
                  <td className="small">{fmtDate(c.sent?.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
