'use client';
// Page-level motion with GSAP. Mounted once in the layout; re-runs on every route change.
// Everything respects prefers-reduced-motion: with it on, content simply appears.

import { useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

// "225s" -> { pre:'', n:225, post:'s', dec:0 }; returns null for text that is not a single number.
function parseNum(text) {
  const m = String(text).trim().match(/^([^\d-]*)(-?\d[\d,]*(?:\.\d+)?)(.*)$/);
  if (!m || /\d/.test(m[3])) return null;
  const raw = m[2].replace(/,/g, '');
  return { pre: m[1], n: Number(raw), post: m[3], dec: (raw.split('.')[1] || '').length, comma: m[2].includes(',') };
}

function countUp(el, delay) {
  const final = el.dataset.final ?? el.textContent;
  el.dataset.final = final;
  const p = parseNum(final);
  if (!p || !Number.isFinite(p.n) || p.n === 0) return;
  const o = { v: 0 };
  const fmt = (v) => {
    const s = p.dec ? v.toFixed(p.dec) : String(Math.round(v));
    return p.pre + (p.comma ? Number(s).toLocaleString() : s) + p.post;
  };
  el.textContent = fmt(0);
  gsap.to(o, { v: p.n, duration: 1.1, delay, ease: 'power2.out', onUpdate: () => (el.textContent = fmt(o.v)), onComplete: () => (el.textContent = final) });
}

export default function Motion() {
  const pathname = usePathname();
  const search = useSearchParams();
  const first = useRef(true);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(
        { motion: '(prefers-reduced-motion: no-preference)', still: '(prefers-reduced-motion: reduce)' },
        (ctx) => {
          const page = document.querySelector('.page');
          if (!page) return;
          if (ctx.conditions.still) {
            gsap.set(page, { opacity: 1 });
            return;
          }

          // Sidebar and top bar only on the first load.
          if (first.current) {
            first.current = false;
            gsap.from('.side .brand, .side .nav a, .side h6', { x: -14, opacity: 0, duration: 0.45, stagger: 0.03, ease: 'power2.out' });
            gsap.from('.top > *', { y: -8, opacity: 0, duration: 0.4, stagger: 0.04, ease: 'power2.out', delay: 0.1 });
          }

          const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
          tl.set(page, { opacity: 1 });
          tl.from(page.children, { y: 18, opacity: 0, duration: 0.55, stagger: 0.06, clearProps: 'transform,opacity' });

          // Stat tiles: lift in, then count up.
          const stats = page.querySelectorAll('.stat');
          if (stats.length) tl.from(stats, { y: 10, opacity: 0, scale: 0.97, duration: 0.45, stagger: 0.04, clearProps: 'transform,opacity' }, 0.12);
          page.querySelectorAll('.stat .v, .stepbox .c').forEach((el, i) => countUp(el, 0.2 + i * 0.03));

          // Seven-step strip: a line draws through the steps, each lights up as it passes.
          const flow = page.querySelector('.flowline i');
          const boxes = page.querySelectorAll('.flowstrip .stepbox');
          if (flow && boxes.length) {
            tl.fromTo(flow, { scaleX: 0 }, { scaleX: 1, duration: 1.2, ease: 'power1.inOut' }, 0.3);
            tl.from(boxes, { y: 14, opacity: 0, duration: 0.4, stagger: 1.2 / boxes.length, ease: 'back.out(1.6)', clearProps: 'transform,opacity' }, 0.3);
          }

          // Table rows ripple in.
          page.querySelectorAll('table.t tbody').forEach((tb) => {
            const rows = tb.querySelectorAll('tr');
            if (rows.length) tl.from(rows, { opacity: 0, x: -8, duration: 0.35, stagger: Math.min(0.04, 0.6 / rows.length), clearProps: 'transform,opacity' }, 0.25);
          });

          // Badges pop.
          tl.from(page.querySelectorAll('.badge'), { scale: 0.8, opacity: 0, duration: 0.3, stagger: 0.01, ease: 'back.out(2)', clearProps: 'transform,opacity' }, 0.35);

          // Hover: clickable cards and step boxes lift a little.
          const hoverables = page.querySelectorAll('a.card, .stepbox, .stat');
          const off = [];
          hoverables.forEach((el) => {
            const enter = () => gsap.to(el, { y: -3, boxShadow: '0 10px 24px rgba(15,35,33,0.10)', duration: 0.25, ease: 'power2.out' });
            const leave = () => gsap.to(el, { y: 0, boxShadow: '0 0 0 rgba(15,35,33,0)', duration: 0.3, ease: 'power2.out', onComplete: () => gsap.set(el, { clearProps: 'boxShadow,transform' }) });
            el.addEventListener('mouseenter', enter);
            el.addEventListener('mouseleave', leave);
            off.push(() => { el.removeEventListener('mouseenter', enter); el.removeEventListener('mouseleave', leave); });
          });
          return () => {
            off.forEach((f) => f());
            // If a count-up is cut short (route change, React re-run), put the real number back.
            document.querySelectorAll('[data-final]').forEach((el) => (el.textContent = el.dataset.final));
          };
        }
      );
      return () => mm.revert();
    },
    { dependencies: [pathname, search?.toString()], revertOnUpdate: true }
  );

  return null;
}
