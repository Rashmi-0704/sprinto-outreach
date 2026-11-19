// Storage. Neon Postgres when DATABASE_URL is set (needed on Vercel); otherwise a local JSON file.
// Every record is a JSON document, so the schema stays four small tables.

import fs from 'node:fs/promises';
import path from 'node:path';

const useDb = () => Boolean(process.env.DATABASE_URL);
export const storageMode = () => (useDb() ? 'Neon Postgres' : process.env.VERCEL ? 'temporary file (set DATABASE_URL)' : 'local file');

// ---------------- Postgres ----------------
let sqlFn;
let ready;
async function sql() {
  if (!sqlFn) {
    const { neon } = await import('@neondatabase/serverless');
    sqlFn = neon(process.env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } });
  }
  if (!ready) {
    ready = (async () => {
      await sqlFn`CREATE TABLE IF NOT EXISTS runs (id SERIAL PRIMARY KEY, created_at TIMESTAMPTZ DEFAULT now(), data JSONB NOT NULL)`;
      await sqlFn`CREATE TABLE IF NOT EXISTS companies (id SERIAL PRIMARY KEY, run_id INT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(), data JSONB NOT NULL)`;
      await sqlFn`CREATE TABLE IF NOT EXISTS events (id SERIAL PRIMARY KEY, created_at TIMESTAMPTZ DEFAULT now(), data JSONB NOT NULL)`;
      await sqlFn`CREATE TABLE IF NOT EXISTS learnings (id SERIAL PRIMARY KEY, created_at TIMESTAMPTZ DEFAULT now(), text TEXT NOT NULL, active BOOLEAN DEFAULT true)`;
    })();
  }
  await ready;
  return sqlFn;
}

const rowDoc = (r) => ({ ...r.data, id: r.id, created_at: r.created_at, ...(r.updated_at ? { updated_at: r.updated_at } : {}), ...(r.run_id !== undefined ? { run_id: r.run_id } : {}) });

// ---------------- File ----------------
const FILE = process.env.VERCEL ? '/tmp/sprinto-store.json' : path.join(process.cwd(), '.data', 'store.json');
let lock = Promise.resolve();
async function readFile() {
  try {
    return JSON.parse(await fs.readFile(FILE, 'utf8'));
  } catch {
    return { seq: 0, runs: [], companies: [], events: [], learnings: [] };
  }
}
async function withFile(fn) {
  const run = lock.then(async () => {
    const db = await readFile();
    const out = await fn(db);
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(db));
    return out;
  });
  lock = run.catch(() => {});
  return run;
}
const now = () => new Date().toISOString();

// ---------------- API ----------------
export async function createRun(data) {
  const doc = { status: 'running', ...data };
  if (useDb()) {
    const s = await sql();
    const [r] = await s`INSERT INTO runs (data) VALUES (${JSON.stringify(doc)}) RETURNING *`;
    return rowDoc(r);
  }
  return withFile((db) => {
    const run = { ...doc, id: ++db.seq, created_at: now() };
    db.runs.push(run);
    return run;
  });
}

export async function updateRun(id, patch) {
  if (useDb()) {
    const s = await sql();
    await s`UPDATE runs SET data = data || ${JSON.stringify(patch)}::jsonb WHERE id = ${id}`;
    return;
  }
  return withFile((db) => {
    const r = db.runs.find((x) => x.id === Number(id));
    if (r) Object.assign(r, patch);
  });
}

export async function listRuns(limit = 20) {
  if (useDb()) {
    const s = await sql();
    return (await s`SELECT * FROM runs ORDER BY id DESC LIMIT ${limit}`).map(rowDoc);
  }
  const db = await readFile();
  return db.runs.slice().reverse().slice(0, limit);
}

export async function getRun(id) {
  if (useDb()) {
    const s = await sql();
    const [r] = await s`SELECT * FROM runs WHERE id = ${id}`;
    return r ? rowDoc(r) : null;
  }
  return (await readFile()).runs.find((x) => x.id === Number(id)) || null;
}

export async function saveCompany(company) {
  const { id, created_at, updated_at, ...data } = company;
  if (useDb()) {
    const s = await sql();
    if (id) {
      const [r] = await s`UPDATE companies SET data = ${JSON.stringify(data)}, run_id = ${data.run_id || null}, updated_at = now() WHERE id = ${id} RETURNING *`;
      return rowDoc(r);
    }
    const [r] = await s`INSERT INTO companies (run_id, data) VALUES (${data.run_id || null}, ${JSON.stringify(data)}) RETURNING *`;
    return rowDoc(r);
  }
  return withFile((db) => {
    if (id) {
      const i = db.companies.findIndex((x) => x.id === Number(id));
      const doc = { ...data, id: Number(id), created_at: db.companies[i]?.created_at || now(), updated_at: now() };
      if (i >= 0) db.companies[i] = doc;
      else db.companies.push(doc);
      return doc;
    }
    const doc = { ...data, id: ++db.seq, created_at: now(), updated_at: now() };
    db.companies.push(doc);
    return doc;
  });
}

export async function getCompany(id) {
  if (useDb()) {
    const s = await sql();
    const [r] = await s`SELECT * FROM companies WHERE id = ${Number(id)}`;
    return r ? rowDoc(r) : null;
  }
  return (await readFile()).companies.find((x) => x.id === Number(id)) || null;
}

// Light list: drops page text and evidence, which only the detail page needs.
const slim = (c) => ({ ...c, pages: (c.pages || []).map(({ text, links, ...p }) => p), facts: undefined });
export async function listCompanies({ status, runId } = {}) {
  let rows;
  if (useDb()) {
    const s = await sql();
    // Strip page text, links and facts inside Postgres so the list pages don't download every scraped page.
    rows = (
      await s`SELECT id, run_id, created_at, updated_at,
        (data - 'facts') || jsonb_build_object('pages', COALESCE((
          SELECT jsonb_agg(p - 'text' - 'links')
          FROM jsonb_array_elements(CASE WHEN jsonb_typeof(data->'pages') = 'array' THEN data->'pages' ELSE '[]'::jsonb END) p
        ), '[]'::jsonb)) AS data
        FROM companies ORDER BY id DESC LIMIT 500`
    ).map(rowDoc);
  } else {
    rows = (await readFile()).companies.slice().reverse();
  }
  if (status) rows = rows.filter((c) => c.status === status);
  if (runId) rows = rows.filter((c) => Number(c.run_id) === Number(runId));
  return rows.map(slim);
}

// Status counts for the sidebar badges: one tiny query instead of loading every company.
export async function statusCounts() {
  if (useDb()) {
    const s = await sql();
    const rows = await s`SELECT data->>'status' AS status, count(*)::int AS n FROM companies GROUP BY 1`;
    return Object.fromEntries(rows.map((r) => [r.status, r.n]));
  }
  const out = {};
  for (const c of (await readFile()).companies) out[c.status] = (out[c.status] || 0) + 1;
  return out;
}

export async function addEvent(data) {
  const doc = { at: now(), ...data };
  if (useDb()) {
    const s = await sql();
    await s`INSERT INTO events (data) VALUES (${JSON.stringify(doc)})`;
    return;
  }
  return withFile((db) => {
    db.events.push({ ...doc, id: ++db.seq });
  });
}

export async function listEvents(limit = 30) {
  if (useDb()) {
    const s = await sql();
    return (await s`SELECT * FROM events ORDER BY id DESC LIMIT ${limit}`).map(rowDoc);
  }
  return (await readFile()).events.slice().reverse().slice(0, limit);
}

export async function addLearning(text) {
  if (useDb()) {
    const s = await sql();
    await s`INSERT INTO learnings (text) VALUES (${text})`;
    return;
  }
  return withFile((db) => {
    db.learnings.push({ id: ++db.seq, text, active: true, created_at: now() });
  });
}

export async function setLearning(id, active) {
  if (useDb()) {
    const s = await sql();
    await s`UPDATE learnings SET active = ${active} WHERE id = ${Number(id)}`;
    return;
  }
  return withFile((db) => {
    const l = db.learnings.find((x) => x.id === Number(id));
    if (l) l.active = active;
  });
}

export async function listLearnings({ activeOnly = false } = {}) {
  let rows;
  if (useDb()) {
    const s = await sql();
    rows = await s`SELECT * FROM learnings ORDER BY id DESC`;
  } else {
    rows = (await readFile()).learnings.slice().reverse();
  }
  return activeOnly ? rows.filter((l) => l.active) : rows;
}
