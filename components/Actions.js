'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

async function post(id, payload) {
  const res = await fetch(`/api/companies/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// Gate 1 actions: give a contact, qualify anyway, drop.
export function ReviewActions({ id, needsContact, canResume }) {
  const router = useRouter();
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [c, setC] = useState({ first_name: '', last_name: '', title: '', email: '' });
  const go = async (label, payload) => {
    setBusy(label);
    setErr('');
    try {
      await post(id, payload);
      router.refresh();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  };
  return (
    <div>
      {needsContact && (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 8, marginBottom: 10 }}>
          {['first_name', 'last_name', 'title', 'email'].map((k) => (
            <input key={k} className="input" placeholder={k.replace('_', ' ')} value={c[k]} onChange={(e) => setC({ ...c, [k]: e.target.value })} />
          ))}
        </div>
      )}
      <div className="row">
        {needsContact && <button className="btn primary sm" disabled={!!busy || !c.email || !c.first_name} onClick={() => go('contact', { action: 'resume', contact: c })}>{busy === 'contact' ? 'Writing…' : 'Use this contact & continue'}</button>}
        {canResume && !needsContact && <button className="btn primary sm" disabled={!!busy} onClick={() => go('resume', { action: 'resume' })}>{busy === 'resume' ? 'Continuing…' : 'Qualify & continue'}</button>}
        <RetryButton id={id} disabled={!!busy} />
        <button className="btn sm danger" disabled={!!busy} onClick={() => go('drop', { action: 'drop' })}>Drop</button>
        {err && <span className="badge b-fail">{err}</span>}
      </div>
    </div>
  );
}

export function ReopenButton({ id }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button className="btn sm" disabled={busy} onClick={async () => { setBusy(true); await post(id, { action: 'to_review' }).catch(() => {}); router.refresh(); setBusy(false); }}>
      Disagree: send to review
    </button>
  );
}

// Re-runs the whole pipeline for this company, in place.
export function RetryButton({ id, disabled }) {
  const router = useRouter();
  const [busy, setBusy] = useState('');
  return (
    <button
      className="btn sm"
      disabled={disabled || !!busy}
      onClick={async () => {
        setBusy('Re-running…');
        const c = await fetch(`/api/companies/${id}/input`).then((r) => r.json());
        const res = await fetch('/api/pipeline', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runId: c.run_id, input: c.input, existingId: id }) });
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          const last = dec.decode(value).trim().split('\n').pop();
          try {
            const e = JSON.parse(last);
            if (e.type === 'step') setBusy(`Step ${e.step}…`);
          } catch {}
        }
        setBusy('');
        router.refresh();
      }}
    >
      {busy || '↻ Re-run'}
    </button>
  );
}

// Gate 2: edit, send, discard. Records edit rate and an optional lesson for the feedback loop.
export function DraftEditor({ id, subject, body, to, gmailReady }) {
  const router = useRouter();
  const [s, setS] = useState(subject);
  const [b, setB] = useState(body);
  const [lesson, setLesson] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const changed = s !== subject || b !== body;
  const go = async (label, payload) => {
    setBusy(label);
    setErr('');
    try {
      await post(id, payload);
      router.refresh();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  };
  return (
    <div>
      <div className="email">
        <div className="hdr">To: <b>{to}</b> <span className="muted">(your inbox)</span></div>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
          <input className="input" value={s} onChange={(e) => setS(e.target.value)} style={{ fontWeight: 600 }} />
        </div>
        <div style={{ padding: 14 }}>
          <textarea className="input" rows={12} value={b} onChange={(e) => setB(e.target.value)} style={{ lineHeight: 1.6 }} />
        </div>
      </div>
      <label className="lbl mt">Lesson for future drafts (optional)</label>
      <input className="input" placeholder="e.g. Lead with the open GRC role, not the funding round" value={lesson} onChange={(e) => setLesson(e.target.value)} />
      <div className="row mt">
        <button className="btn primary" disabled={!!busy || !gmailReady} onClick={() => go('send', { action: 'send', subject: s, body: b, learning: lesson })}>{busy === 'send' ? 'Sending…' : 'Send to my inbox'}</button>
        {changed && <button className="btn" disabled={!!busy} onClick={() => go('save', { action: 'save', subject: s, body: b })}>Save edits</button>}
        <button className="btn danger" disabled={!!busy} onClick={() => go('discard', { action: 'discard', learning: lesson })}>Discard</button>
        {!gmailReady && <span className="badge b-unknown">Gmail not set up: add GMAIL_USER, GMAIL_APP_PASSWORD, MY_EMAIL</span>}
        {err && <span className="badge b-fail">{err}</span>}
      </div>
    </div>
  );
}

export function LearningToggle({ id, active }) {
  const router = useRouter();
  return (
    <button
      className="btn sm"
      onClick={async () => {
        await fetch('/api/learnings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, active: !active }) });
        router.refresh();
      }}
    >
      {active ? 'Turn off' : 'Turn on'}
    </button>
  );
}

export function AddLearning() {
  const router = useRouter();
  const [t, setT] = useState('');
  return (
    <div className="row">
      <input className="input" style={{ flex: 1 }} placeholder="Add a rule the writer should follow, e.g. Never mention the funding amount" value={t} onChange={(e) => setT(e.target.value)} />
      <button
        className="btn primary"
        disabled={!t.trim()}
        onClick={async () => {
          await fetch('/api/learnings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: t }) });
          setT('');
          router.refresh();
        }}
      >
        Add
      </button>
    </div>
  );
}
