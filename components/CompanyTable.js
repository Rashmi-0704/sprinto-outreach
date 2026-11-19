import Link from 'next/link';
import { StatusBadge } from '@/components/Badge';
import { STAGE_LABEL } from '@/lib/ui';

export default function CompanyTable({ companies }) {
  if (!companies.length) return <div className="empty">No companies yet. <Link href="/run" className="src">Run the pipeline on a list of domains →</Link></div>;
  return (
    <table className="t">
      <thead><tr><th>Company</th><th>Stage</th><th>Status</th><th>Fit</th><th>Contact</th><th>Why</th></tr></thead>
      <tbody>
        {companies.map((c) => (
          <tr key={c.id}>
            <td><Link href={`/companies/${c.id}`}><b>{c.name}</b><div className="sub">{c.domain}</div></Link></td>
            <td>{STAGE_LABEL[c.stage] || <span className="muted">—</span>}</td>
            <td><StatusBadge status={c.status} /></td>
            <td className="mono">{c.fit ?? '—'}</td>
            <td>{c.contact ? <>{c.contact.first_name} {c.contact.last_name}<div className="sub">{c.contact.title}</div></> : <span className="muted">—</span>}</td>
            <td className="small" style={{ maxWidth: 360 }}>{c.status_reason || (c.flags?.length ? c.flags.join('; ') : '—')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
