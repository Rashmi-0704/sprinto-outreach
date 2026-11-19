// Free pre-screen before a run: no Gemini, no Hunter. Reads the homepage, the security page and the trust centre,
// and rules out companies already on a compliance platform (Vanta, Drata, Sprinto...) or already holding SOC 2 + ISO 27001.
// Usage: node scripts/screen.mjs domains.txt   ->  prints PASS / SKIP with the reason, and writes passing domains to stdout file if given.

import fs from 'node:fs';
import { readPage, pickLinks, trustCenters, normalizeDomain } from '../lib/scrape.js';
import { certificationsHeld } from '../lib/qualify.js';
import { emptyFacts } from '../lib/extract.js';
import { FRAMEWORKS } from '../lib/config.js';

const [file, out] = process.argv.slice(2);
const domains = fs.readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((d) => normalizeDomain(d)).filter(Boolean);
const pass = [];

async function screen(domain) {
  const home = await readPage(`https://${domain}`);
  if (home.error) return { ok: false, why: `site unreachable: ${home.error}` };
  const pages = [home];
  const crawl = pickLinks(home.links, ['trust']);
  if (crawl.trust) pages.push(await readPage(crawl.trust));
  const centres = trustCenters(home.links, domain);
  pages.push(await readPage(centres[0] || `https://trust.${domain}`));
  const ok = pages.filter((p) => !p.error);
  const comp = ok.flatMap((p) => (p.signals?.competitors || []).map((c) => ({ ...c, url: p.url })))[0];
  if (comp) return { ok: false, why: `${comp.customer ? 'already a Sprinto customer' : `on ${comp.name}`} (${comp.url})` };
  const frameworks = ok.flatMap((p) => (p.signals?.frameworks || []).map((f) => ({ ...f, url: p.url })));
  const { held } = certificationsHeld(emptyFacts(), { frameworks });
  const core = FRAMEWORKS.filter((f) => f.core && held.has(f.key)).map((f) => f.key);
  if (core.length === FRAMEWORKS.filter((f) => f.core).length) return { ok: false, why: `already holds ${core.join(' + ')}` };
  return { ok: true, why: held.size ? `holds ${[...held.keys()].join(', ')}; frameworks left to sell` : 'no certification or compliance vendor found' };
}

for (const d of domains) {
  try {
    const r = await screen(d);
    console.log(`${r.ok ? 'PASS' : 'SKIP'}  ${d.padEnd(22)} ${r.why}`);
    if (r.ok) pass.push(d);
  } catch (e) {
    console.log(`ERR   ${d.padEnd(22)} ${e.message}`);
  }
}
console.log(`\n${pass.length}/${domains.length} pass the free screen`);
if (out) fs.writeFileSync(out, pass.join('\n') + '\n');
