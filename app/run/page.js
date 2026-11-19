import Link from 'next/link';
import RunConsole from '@/components/RunConsole';
import { listRuns, listCompanies } from '@/lib/store';
import { hunterCredits } from '@/lib/contact';
import { StatusBadge } from '@/components/Badge';
import { fmtDate } from '@/lib/ui';

export const dynamic = 'force-dynamic';

const HOW = [
  'Crawl the homepage, plus the trust/security and careers pages it links to (job boards read through their public APIs)',
  'Extract named facts with verbatim quotes; code checks every quote is really on the page',
  'Qualify with five rule gates; when a fact is missing, an agent loop picks the next page to read (max 4 extra fetches)',
  'Find the decision-maker with Hunter (or your Apollo list) and stage-based title rules',
  'Name two pain points for that person, each tied to a quote',
  'Write the email; a validator checks name, length, hook, evidence and invented numbers',
  'Send clean drafts to your own inbox; anything flagged waits for you',
];

export default async function RunPage() {
  const [runs, companies, credits] = await Promise.all([listRuns(5), listCompanies(), hunterCredits()]);
  return (
    <div className="page">
      <div className="eyebrow">The repeatable mode</div>
      <h1>Run on domains</h1>
      <p className="lede">Paste a list of company domains. The pipeline runs end to end on each one without stopping for decisions. Only what the rules cannot settle comes back to you.</p>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', gap: 16 }}>
        <RunConsole max={Number(process.env.MAX_DOMAINS_PER_RUN || 10)} />
        <div className="card card-pad">
          <h2>What happens to each domain</h2>
          <ol className="ladder" style={{ paddingLeft: 4 }}>{HOW.map((h) => <li key={h} className="small">{h}</li>)}</ol>
          <dl className="kv mt">
            <dt>Hunter</dt><dd>{process.env.HUNTER_API_KEY ? (credits ? `${credits.available - credits.used} of ${credits.available} searches left` : 'connected') : 'off: using data/contacts.json'}</dd>
            <dt>Sending</dt><dd>{String(process.env.AUTO_SEND || 'true') === 'false' ? 'every draft waits for you' : 'clean drafts send automatically'}</dd>
            <dt>Terminal</dt><dd><code>npm run pipeline -- domains.txt</code></dd>
          </dl>
        </div>
      </div>
      <div className="card mt2">
        <div className="card-head"><h2>Recent runs</h2></div>
        {runs.length === 0 ? <div className="empty">No runs yet.</div> : (
          <table className="t">
            <thead><tr><th>Run</th><th>Company</th><th>Outcome</th><th>Contact</th><th>Reason</th></tr></thead>
            <tbody>
              {runs.flatMap((r) => {
                const rows = companies.filter((c) => Number(c.run_id) === r.id);
                return rows.map((c, i) => (
                  <tr key={c.id}>
                    <td className="small">{i === 0 ? <><b>#{r.id}</b> · {fmtDate(r.created_at)}<div className="sub">{r.source} · {r.status}</div></> : ''}</td>
                    <td><Link href={`/companies/${c.id}`}><b>{c.name}</b><div className="sub">{c.domain}</div></Link></td>
                    <td><StatusBadge status={c.status} /></td>
                    <td className="small">{c.contact ? `${c.contact.first_name} ${c.contact.last_name || ''} · ${c.contact.title}` : '—'}</td>
                    <td className="small">{c.status_reason || '—'}</td>
                  </tr>
                ));
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
