import { readPage, pickLinks, findJobBoard, readJobBoard } from '../lib/scrape.js';
for (const d of process.argv.slice(2)) {
  let t = Date.now();
  const p = await readPage(`https://${d}`);
  console.log(`== ${d} ${Date.now() - t}ms`, p.error || `${p.method} ${p.words}w`);
  if (p.error) continue;
  const crawl = pickLinks(p.links, ['trust', 'careers']);
  const board = findJobBoard(p.links);
  console.log('crawl', JSON.stringify(crawl), 'board', JSON.stringify(board), 'signals', JSON.stringify(p.signals));
  for (const u of Object.values(crawl)) { t = Date.now(); const x = await readPage(u); console.log('  ', u, Date.now() - t, x.error || `${x.method} ${x.words}w`, JSON.stringify(x.signals || {}).slice(0, 300)); const b = findJobBoard(x.links || []); if (b) { const j = await readJobBoard(b); console.log('   jobs', j.jobCount, j.text.slice(0, 200)); } }
}
