// Terminal mode: npm run pipeline -- domains.txt   (or: npm run pipeline -- rillet.com attio.com)
// Same pipeline as the web app; results land in the same store, so they show up on the dashboard.

import fs from 'node:fs';
import { runCompany, parseInputLine } from '../lib/pipeline.js';
import { createRun, updateRun } from '../lib/store.js';

const args = process.argv.slice(2);
if (!args.length) {
  console.log('Usage: npm run pipeline -- domains.txt   |   npm run pipeline -- rillet.com "attio.com, Series B"');
  process.exit(1);
}
const lines = args.length === 1 && fs.existsSync(args[0]) ? fs.readFileSync(args[0], 'utf8').split(/\r?\n/) : args;
const inputs = lines.map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map(parseInputLine).filter(Boolean);
if (!inputs.length) {
  console.log('No valid domains found.');
  process.exit(1);
}

const run = await createRun({ source: 'terminal', domains: inputs.map((i) => i.raw) });
console.log(`Run #${run.id}: ${inputs.length} domain(s)\n`);
const summary = {};
for (const input of inputs) {
  console.log(`── ${input.domain}`);
  const c = await runCompany({
    input,
    runId: run.id,
    emit: (e) => {
      if (e.type === 'trail') console.log(`   ${e.entry.stage.padEnd(8)} ${e.entry.result.padEnd(7)} ${e.entry.by === 'agent' ? '[agent] ' : ''}${e.entry.name}${e.entry.note ? ` — ${e.entry.note}` : ''}`);
    },
  });
  summary[c.status] = (summary[c.status] || 0) + 1;
  console.log(`   => ${c.status.toUpperCase()}${c.status_reason ? `: ${c.status_reason}` : ''}${c.contact ? ` · ${c.contact.first_name} ${c.contact.last_name || ''} (${c.contact.title})` : ''}\n`);
  if (c.draft) console.log(`   Subject: ${c.draft.subject}\n   ${c.draft.body.replace(/\n/g, '\n   ')}\n`);
}
await updateRun(run.id, { status: 'completed', summary, finished_at: new Date().toISOString() });
console.log('Summary:', summary);
