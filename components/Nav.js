'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Nav({ counts }) {
  const path = usePathname();
  const item = (href, label, count) => {
    const on = href === '/' ? path === '/' : path.startsWith(href);
    return (
      <Link href={href} className={on ? 'on' : ''}>
        <span>{label}</span>
        {count ? <span className="count">{count}</span> : null}
      </Link>
    );
  };
  return (
    <nav className="nav">
      <h6>PIPELINE</h6>
      {item('/', 'Overview')}
      {item('/run', 'Run on domains')}
      {item('/companies', 'Companies')}
      <h6>HUMAN GATES</h6>
      {item('/review', 'Review queue', counts.review)}
      {item('/drafts', 'Drafts & sends', counts.draft)}
      <h6>LEARNING</h6>
      {item('/loop', 'Feedback loop', counts.learnings)}
      {item('/icp', 'ICP & evidence map')}
    </nav>
  );
}
