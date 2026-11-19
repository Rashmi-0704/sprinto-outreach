'use client';
import { useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

const STEPS = ['Scrape', 'Extract', 'Qualify', 'Find PoC', 'Pain points', 'Draft', 'Send'];
const STATUS_LABEL = { sent: 'Sent', draft: 'Draft waiting', review: 'Needs review', dropped: 'Dropped', error: 'Error' };

export default function RunConsole({ max }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]); // per domain: { domain, steps:{}, log:[], result }
  const [active, setActive] = useState(0);
  const logRef = useRef(null);
  const boxRef = useRef(null);
  const seen = useRef(new Set());

  const lines = text.split(/\n|;/).map((l) => l.trim()).filter(Boolean);

  function patch(i, fn) {
    setRows((prev) => prev.map((r, j) => (j === i ? fn({ ...r }) : r)));
  }

  async function start() {
    setError('');
    setRunning(true);
    try {
      const res = await fetch('/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRows(data.inputs.map((inp) => ({ domain: inp.domain, steps: {}, log: [], result: null })));
      const summary = { sent: 0, draft: 0, review: 0, dropped: 0, error: 0 };
      for (let i = 0; i < data.inputs.length; i++) {
        setActive(i);
        const status = await runOne(i, data.run.id, data.inputs[i]);
        summary[status] = (summary[status] || 0) + 1;
      }
      await fetch('/api/runs', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: data.run.id, status: 'completed', summary }) });
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  async function runOne(i, runId, input) {
    const res = await fetch('/api/pipeline', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runId, input }) });
    if (!res.ok || !res.body) {
      patch(i, (r) => ({ ...r, result: { status: 'error', reason: `HTTP ${res.status}` } }));
      return 'error';
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let final = 'error';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split('\n');
      buf = parts.pop();
      for (const p of parts) {
        if (!p.trim()) continue;
        const evt = JSON.parse(p);
        if (evt.type === 'company') patch(i, (r) => ({ ...r, id: evt.id }));
        if (evt.type === 'step') patch(i, (r) => ({ ...r, steps: { ...r.steps, [evt.step]: { state: evt.state, note: evt.note } } }));
        if (evt.type === 'trail') {
          patch(i, (r) => ({ ...r, log: [...r.log, evt.entry] }));
          requestAnimationFrame(() => logRef.current && (logRef.current.scrollTop = logRef.current.scrollHeight));
        }
        if (evt.type === 'done') {
          final = evt.status;
          patch(i, (r) => ({ ...r, id: evt.id || r.id, result: evt }));
        }
      }
    }
    return final;
  }

  const cur = rows[active];
  const doneSteps = rows.reduce((a, r) => a + (r.result ? 7 : Object.values(r.steps).filter((x) => x.state && x.state !== 'active').length), 0);
  const pct = rows.length ? doneSteps / (rows.length * 7) : 0;
  const sig = cur ? `${active}|${Object.entries(cur.steps).map(([k, v]) => k + v.state).join(',')}|${cur.log.length}|${cur.result?.status || ''}` : '';

  // Live motion: shimmer on the running step, ticks pop as steps finish, new log lines slide in.
  useGSAP(
    () => {
      if (!boxRef.current || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const root = boxRef.current;
      root.querySelectorAll('.stepbox .scan').forEach((el) => !gsap.isTweening(el) && gsap.fromTo(el, { xPercent: -100 }, { xPercent: 100, duration: 1.3, ease: 'sine.inOut', repeat: -1 }));
      root.querySelectorAll('.stepbox[data-key]').forEach((el) => {
        const key = el.dataset.key;
        if (seen.current.has(key)) return;
        seen.current.add(key);
        gsap.fromTo(el, { scale: 0.94 }, { scale: 1, duration: 0.5, ease: 'back.out(2.2)', clearProps: 'transform' });
        const tick = el.querySelector('.tick');
        if (tick) gsap.from(tick, { scale: 0, rotate: -90, duration: 0.45, ease: 'back.out(2.5)' });
      });
      const last = logRef.current?.lastElementChild;
      if (last && !last.dataset.shown) {
        last.dataset.shown = '1';
        gsap.from(last, { x: -10, opacity: 0, duration: 0.35, ease: 'power2.out' });
      }
      const res = root.querySelector('.result-line');
      if (res && !res.dataset.shown) {
        res.dataset.shown = '1';
        gsap.from(res, { y: 10, opacity: 0, duration: 0.5, ease: 'power3.out' });
        gsap.from(res.querySelector('.badge'), { scale: 0.5, duration: 0.6, ease: 'elastic.out(1, 0.5)' });
      }
    },
    { dependencies: [sig], scope: boxRef, revertOnUpdate: false }
  );
  useGSAP(() => {
    const bar = boxRef.current?.querySelector('.progress i');
    if (bar) gsap.to(bar, { scaleX: pct, duration: 0.6, ease: 'power2.out' });
  }, { dependencies: [pct], scope: boxRef });

  return (
    <div className="card" ref={boxRef}>
      {rows.length > 0 && <div className="progress"><i /></div>}
      <div className="card-pad">
        <label className="lbl">Domains</label>
        <textarea
          className="input mono"
          rows={6}
          placeholder={'rillet.com\nattio.com, Series B\nlinear.app'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={running}
        />
        <div className="spread" style={{ marginTop: 10 }}>
          <span className="muted small">{lines.length}/{max} domains · one per line · optional stage after a comma</span>
          <button className="btn primary" onClick={start} disabled={running || !lines.length || lines.length > max}>
            {running ? 'Running…' : '▶ Run the pipeline'}
          </button>
        </div>
        {error && <div className="badge b-fail" style={{ marginTop: 10, whiteSpace: 'normal' }}>{error}</div>}
      </div>

      {rows.length > 0 && (
        <>
          <div className="row" style={{ padding: '0 20px 10px', gap: 6 }}>
            {rows.map((r, i) => (
              <button key={r.domain} className={`btn sm ${i === active ? 'primary' : ''}`} onClick={() => setActive(i)}>
                {r.result ? '' : running && i === rows.findIndex((x) => !x.result) ? '● ' : ''}
                {r.domain}
                {r.result && <span style={{ opacity: 0.8 }}> · {STATUS_LABEL[r.result.status] || r.result.status}</span>}
              </button>
            ))}
          </div>
          {cur && (
            <>
              <div className="strip" style={{ paddingTop: 0 }}>
                {STEPS.map((s, i) => {
                  const st = cur.steps[i + 1];
                  return (
                    <div key={s} className={`stepbox ${st?.state || ''}`} data-key={st?.state ? `${active}-${i}-${st.state}` : undefined}>
                      {st?.state === 'active' && <span className="scan" />}
                      {st?.state === 'done' && <span className="tick">✓</span>}
                      {st?.state === 'fail' && <span className="tick x">✕</span>}
                      {st?.state === 'skip' && <span className="tick s">–</span>}
                      <div className="n">STEP {i + 1}</div>
                      <div className="t">{s}</div>
                      <div className="note">{st?.state === 'active' ? <span className="dot live" /> : null} {st?.note || ''}</div>
                    </div>
                  );
                })}
              </div>
              {cur.result && (
                <div className="spread result-line" style={{ padding: '0 20px 12px' }}>
                  <div>
                    <span className={`badge b-${cur.result.status}`}>{STATUS_LABEL[cur.result.status] || cur.result.status}</span>{' '}
                    <span className="small">{cur.result.reason || (cur.result.contact ? `to ${cur.result.contact.first_name} (${cur.result.contact.title})` : '')}</span>
                  </div>
                  {cur.id && <Link className="src" href={`/companies/${cur.id}`}>Open decision trail →</Link>}
                </div>
              )}
              <div className="log" ref={logRef}>
                {cur.log.length === 0 ? <div className="muted">waiting…</div> : cur.log.map((e, i) => (
                  <div key={i}>
                    <span className="muted">{e.stage.padEnd(8, ' ')}</span>{' '}
                    <span className={`badge b-${e.result}`} style={{ fontSize: 10 }}>{e.result}</span>{' '}
                    {e.by === 'agent' && <span className="badge b-agent" style={{ fontSize: 10 }}>agent</span>} <b>{e.name}</b>
                    {e.note ? <span className="muted"> — {e.note}</span> : null}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
