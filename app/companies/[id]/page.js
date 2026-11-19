import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCompany } from '@/lib/store';
import { StatusBadge } from '@/components/Badge';
import CompanyTabs from '@/components/CompanyTabs';
import { ReviewActions, ReopenButton, RetryButton } from '@/components/Actions';
import { STAGE_LABEL, fmtDate, sumUsage } from '@/lib/ui';

export const dynamic = 'force-dynamic';

export default async function CompanyPage({ params }) {
  const c = await getCompany(params.id);
  if (!c) notFound();
  const pages = (c.pages || []).filter((p) => !p.error);
  const usage = sumUsage(c.usage);
  // Page text is large; the browser only needs a preview of each.
  const slim = { ...c, pages: (c.pages || []).map(({ links, ...p }) => ({ ...p, text: p.text ? p.text.slice(0, 3000) : null })) };

  return (
    <div className="page">
      <Link href="/companies" className="src">← Companies</Link>
      <div className="spread" style={{ marginTop: 10 }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>{c.name}</h1>
          <div className="muted">
            <a href={`https://${c.domain}`} target="_blank" rel="noreferrer" className="src">{c.domain}</a> · run #{c.run_id ?? '—'} · {fmtDate(c.created_at)}
            {c.input?.stageHint ? ` · stage given: ${c.input.stageHint.raw}` : ''}
          </div>
        </div>
        <div className="row"><StatusBadge status={c.status} />{c.status !== 'running' && c.status !== 'review' && <RetryButton id={c.id} />}</div>
      </div>
      {c.status_reason && <p className="note" style={{ marginTop: 10 }}><b>Why:</b> {c.status_reason}</p>}

      <div className="grid g6 mt">
        <Box k="Funding stage" v={STAGE_LABEL[c.stage] || '—'} s={c.facts?.funding_detail?.value || (c.input?.stageHint ? 'from run input' : 'not published')} />
        <Box k="Fit score" v={c.fit ?? '—'} s={c.qualification?.angle ? `angle: ${c.qualification.angle.replace(/_/g, ' ')}` : 'computed in code'} />
        <Box k="Pages read" v={`${pages.length}`} s={`${c.loops || 0} by the agent loop`} />
        <Box k="Contact" v={c.contact ? c.contact.first_name : '—'} s={c.contact?.title || 'not found'} />
        <Box k="Gemini" v={usage.calls} s={`${(usage.in / 1000).toFixed(1)}k in · ${(usage.out / 1000).toFixed(1)}k out`} />
        <Box k="Time" v={c.duration_ms ? `${Math.round(c.duration_ms / 1000)}s` : '—'} s="vs 15-20 min by hand" />
      </div>

      {(c.status === 'review' || c.status === 'error') && (
        <div className="card card-pad mt" style={{ borderColor: 'var(--warn)' }}>
          <h2>This company is waiting on you</h2>
          <p className="muted small" style={{ marginTop: 2 }}>{c.status_reason}. Give the missing piece and the pipeline continues from step 4, or drop it.</p>
          <ReviewActions id={c.id} needsContact={/contact/i.test(c.status_reason || '') || (c.qualification && !c.contact)} canResume={Boolean(c.qualification)} />
        </div>
      )}
      {c.status === 'draft' && (
        <div className="card card-pad mt" style={{ borderColor: 'var(--warn)' }}>
          <div className="spread"><div><h2>Draft held for a check</h2><div className="muted small">{c.status_reason}</div></div><Link href={`/drafts#c${c.id}`} className="btn primary sm">Review the draft →</Link></div>
        </div>
      )}
      {c.status === 'dropped' && (
        <div className="row mt"><ReopenButton id={c.id} /><span className="muted small">If the rule got it wrong, reopen it. The override is logged for the feedback loop.</span></div>
      )}

      <CompanyTabs company={slim} />
    </div>
  );
}

function Box({ k, v, s }) {
  return (
    <div className="card stat">
      <div className="k">{k}</div>
      <div className="v" style={{ fontSize: 20 }}>{v}</div>
      <div className="s">{s}</div>
    </div>
  );
}
