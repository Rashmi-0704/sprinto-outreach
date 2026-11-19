import Link from 'next/link';
import { listCompanies } from '@/lib/store';
import CompanyTable from '@/components/CompanyTable';
import { STATUS_LABEL } from '@/lib/ui';

export const dynamic = 'force-dynamic';

export default async function Companies({ searchParams }) {
  const status = searchParams?.status || '';
  const all = await listCompanies();
  const rows = status ? all.filter((c) => c.status === status) : all;
  const tabs = ['', 'sent', 'draft', 'review', 'dropped', 'error'];
  return (
    <div className="page">
      <div className="eyebrow">Every company the pipeline has seen</div>
      <h1>Companies</h1>
      <p className="lede">Open any company to see its decision trail: which pages were read, which facts were verified, which gate passed or failed and why, who was chosen, and the email.</p>
      <div className="row" style={{ marginBottom: 14 }}>
        {tabs.map((t) => (
          <Link key={t} href={t ? `/companies?status=${t}` : '/companies'} className={`btn sm ${status === t ? 'primary' : ''}`}>
            {t ? STATUS_LABEL[t] : 'All'} · {t ? all.filter((c) => c.status === t).length : all.length}
          </Link>
        ))}
      </div>
      <div className="card"><CompanyTable companies={rows} /></div>
    </div>
  );
}
