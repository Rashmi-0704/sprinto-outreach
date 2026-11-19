import { STATUS_LABEL } from '@/lib/ui';
export function StatusBadge({ status }) {
  return <span className={`badge b-${status}`}>{STATUS_LABEL[status] || status}</span>;
}
export function ResultBadge({ result }) {
  const label = { pass: 'Pass', fail: 'Fail', unknown: 'Unknown', info: 'Info' }[result] || result;
  return <span className={`badge b-${result}`}>{label}</span>;
}
export function ByBadge({ by }) {
  return <span className={`badge b-${by}`}>{by}</span>;
}
