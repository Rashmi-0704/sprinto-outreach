// Small helpers shared by server pages.
export const STATUS_LABEL = { sent: 'Sent', draft: 'Draft waiting', review: 'Needs review', dropped: 'Dropped', error: 'Error', running: 'Running' };
export const STAGE_LABEL = { pre_seed: 'Pre-seed', seed: 'Seed', series_a: 'Series A', series_b: 'Series B', series_c: 'Series C', series_d_plus: 'Series D+', public: 'Public', bootstrapped: 'Bootstrapped' };

export function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
}

export function ago(d) {
  if (!d) return '';
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// Word-level edit rate between the model's draft and what was sent: 0 = untouched, 1 = rewritten.
export function editRate(a, b) {
  const x = String(a || '').split(/\s+/).filter(Boolean);
  const y = String(b || '').split(/\s+/).filter(Boolean);
  if (!x.length && !y.length) return 0;
  const dp = Array.from({ length: x.length + 1 }, () => new Array(y.length + 1).fill(0));
  for (let i = 1; i <= x.length; i++) for (let j = 1; j <= y.length; j++) dp[i][j] = x[i - 1] === y[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return Math.round((1 - dp[x.length][y.length] / Math.max(x.length, y.length)) * 1000) / 1000;
}

export function sumUsage(usage = {}) {
  return Object.values(usage).reduce((a, u) => ({ calls: a.calls + u.calls, in: a.in + u.in, out: a.out + u.out }), { calls: 0, in: 0, out: 0 });
}
