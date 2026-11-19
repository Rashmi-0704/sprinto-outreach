import Link from 'next/link';
import { listCompanies } from '@/lib/store';
import { ReviewActions } from '@/components/Actions';
import { StatusBadge } from '@/components/Badge';
import { STAGE_LABEL } from '@/lib/ui';

export const dynamic = 'force-dynamic';

export default async function Review() {
  const rows = (await listCompanies()).filter((c) => c.status === 'review' || c.status === 'error');
  return (
    <div className="page">
      <div className="eyebrow">Human gate 1</div>
      <h1>Review queue</h1>
      <p className="lede">Companies the rules could not settle: the site could not be read, the agent loop ran out of budget without confirming B2B SaaS, or no decision-maker was found. The pipeline parks them here instead of guessing. Give it the missing piece and it continues from step 4.</p>
      {rows.length === 0 && <div className="card empty">Nothing waiting. Every company in the last runs was settled by the rules.</div>}
      <div className="grid">
        {rows.map((c) => {
          const unknown = (c.qualification?.gates || []).filter((g) => g.result === 'unknown');
          return (
            <div key={c.id} className="card card-pad">
              <div className="spread">
                <div><Link href={`/companies/${c.id}`}><h2 style={{ display: 'inline' }}>{c.name}</h2></Link> <span className="muted">{c.domain}</span></div>
                <div className="row"><span className="muted small">{STAGE_LABEL[c.stage] || 'stage unknown'}{c.fit ? ` · fit ${c.fit}` : ''}</span><StatusBadge status={c.status} /></div>
              </div>
              <p className="note" style={{ margin: '8px 0' }}><b>Why it is here:</b> {c.status_reason}</p>
              {unknown.length > 0 && <div className="small muted" style={{ marginBottom: 8 }}>Unanswered: {unknown.map((g) => `${g.name} (${g.note})`).join(' · ')}</div>}
              <ReviewActions id={c.id} needsContact={Boolean(c.qualification) && !c.contact} canResume={Boolean(c.qualification)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
