import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { advance, choices, compare, createRun, decide, forecast, metrics, record, setCapacity, type Run } from '@/lib/simulation';
import { configSchema, controlSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
function database() { if (!env.DB) throw new HttpError(503, 'Database is unavailable. Apply the local database migration before starting.'); return env.DB; }
async function load(id: string): Promise<Run> { const row = await database().prepare('SELECT state FROM simulation_runs WHERE id = ?').bind(id).first<{ state: string }>(); if (!row) throw new HttpError(404, 'Simulation not found.'); return JSON.parse(row.state); }
async function save(run: Run, expected: number, previousSequence: number) {
  const db = database(); const pending = run.events.filter(e => e.sequence > previousSequence); run.events = run.events.slice(-80); run.revision = expected + 1;
  const writeToken = crypto.randomUUID();
  const state = JSON.stringify({ ...run, writeToken });
  // D1 batch is transactional: the state and its event journal commit together.
  // The unique token gates journal writes if this request loses the revision race.
  const statements = [db.prepare('UPDATE simulation_runs SET state = ?, revision = ?, status = ?, updated_at = ? WHERE id = ? AND revision = ?').bind(state, run.revision, run.status, new Date().toISOString(), run.id, expected)];
  if (pending.length) statements.push(db.prepare("INSERT INTO simulation_events (id, run_id, sequence, payload) SELECT ? || ':' || json_extract(event.value, '$.sequence'), ?, json_extract(event.value, '$.sequence'), event.value FROM json_each(?) AS event WHERE EXISTS (SELECT 1 FROM simulation_runs WHERE id = ? AND json_extract(state, '$.writeToken') = ?)").bind(run.id, run.id, JSON.stringify(pending), run.id, writeToken));
  const results = await db.batch(statements);
  if (!results[0].meta.changes) throw new HttpError(409, 'The run changed in another tab. Refreshing its state; retry your action.');
}
async function handle(request: Request) {
  const url = new URL(request.url); const p = url.pathname.replace(/^\/api\//, '').split('/'); const method = request.method;
  if (method === 'POST' && request.headers.get('origin') && request.headers.get('origin') !== url.origin) throw new HttpError(403, 'Cross-origin write requests are not allowed.');
  const db = database();
  if (p[0] === 'health') return json({ ok: true, mode: 'simulation' });
  if (method === 'GET' && p[0] === 'scenarios') {
    if (p[1]) { const row = await db.prepare('SELECT * FROM scenarios WHERE id = ?').bind(p[1]).first<{ id: string; config: string }>(); if (!row) throw new HttpError(404, 'Scenario not found.'); return json({ ...row, config: JSON.parse(row.config) }); }
    const rows = await db.prepare('SELECT * FROM scenarios ORDER BY created_at DESC LIMIT 100').all<{ config: string }>(); return json(rows.results.map(r => ({ ...r, config: JSON.parse(r.config) })));
  }
  if (method === 'POST' && p[0] === 'scenarios') { const config = configSchema.parse(await request.json()); const id = crypto.randomUUID(); await db.prepare('INSERT INTO scenarios (id, name, config, created_at) VALUES (?, ?, ?, ?)').bind(id, config.name, JSON.stringify(config), new Date().toISOString()).run(); return json({ id, config }, 201); }
  if (method === 'GET' && p[0] === 'evaluations') { const rows = await db.prepare('SELECT * FROM evaluations ORDER BY created_at DESC LIMIT 20').all<{ result: string }>(); return json(rows.results.map(r => ({ ...r, result: JSON.parse(r.result) }))); }
  if (method === 'POST' && p[0] === 'runs' && p[1] === 'compare') {
    const body = z.object({ config: configSchema, seeds: z.array(z.number().int().min(0).max(2147483647)).min(3).max(10).refine(s => new Set(s).size === s.length, 'Use distinct seeds.') }).parse(await request.json());
    const result = compare(body.config, body.seeds); result.id = crypto.randomUUID(); result.createdAt = new Date().toISOString();
    await db.prepare('INSERT INTO evaluations (id, name, result, created_at) VALUES (?, ?, ?, ?)').bind(result.id, body.config.name, JSON.stringify(result), result.createdAt).run(); return json(result);
  }
  if (p[0] === 'runs' && !p[1]) {
    if (method === 'GET') { const rows = await db.prepare('SELECT id, scenario_id, name, status, revision, created_at, updated_at FROM simulation_runs ORDER BY updated_at DESC LIMIT 50').all(); return json(rows.results); }
    const body = z.object({ scenarioId: z.string().min(1) }).parse(await request.json()); const s = await db.prepare('SELECT config FROM scenarios WHERE id = ?').bind(body.scenarioId).first<{ config: string }>(); if (!s) throw new HttpError(404, 'Scenario not found.');
    const run = createRun(configSchema.parse(JSON.parse(s.config)), crypto.randomUUID(), body.scenarioId);
    await db.prepare('INSERT INTO simulation_runs (id, scenario_id, name, status, state, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(run.id, run.scenarioId, run.config.name, run.status, JSON.stringify(run), 0, run.createdAt, run.createdAt).run();
    await db.prepare('INSERT INTO simulation_events (id, run_id, sequence, payload) VALUES (?, ?, ?, ?)').bind(`${run.id}:1`, run.id, 1, JSON.stringify(run.events[0])).run(); return json(run, 201);
  }
  if (p[0] === 'runs' && p[1]) {
    const run = await load(p[1]);
    if (method === 'GET') {
      if (p[2] === 'state') return json(run);
      if (p[2] === 'metrics') return json(metrics(run));
      if (p[2] === 'predictions') return json(run.hospitals.map(h => ({ hospitalId: h.id, horizons: [15, 30, 60].map(minutes => ({ minutes, ...forecast(run, h, minutes) })) })));
      if (p[2] === 'choices') { const id = url.searchParams.get('ambulanceId'); if (!id || !run.ambulances.some(a => a.id === id)) throw new HttpError(404, 'Ambulance not found.'); return json(choices(run, id)); }
      if (p[2] === 'events') { const rows = await db.prepare('SELECT payload FROM simulation_events WHERE run_id = ? ORDER BY sequence').bind(run.id).all<{ payload: string }>(); return json(rows.results.map(r => JSON.parse(r.payload))); }
      if (p[2] === 'export') { const events = await db.prepare('SELECT payload FROM simulation_events WHERE run_id = ? ORDER BY sequence').bind(run.id).all<{ payload: string }>(); return json({ ...run, events: events.results.map(r => JSON.parse(r.payload)), metrics: metrics(run), methodology: 'Synthetic simulation; completed-case metrics exclude unfinished cases. Travel is a distance-based estimate, not road routing.' }); }
    }
    if (method === 'POST' && (p[2] === 'control' || p[2] === 'decisions')) {
      const raw = z.object({ revision: z.number().int().min(0) }).passthrough().parse(await request.json()); const revision = raw.revision; const previousSequence = run.sequence; if (revision !== run.revision) throw new HttpError(409, 'Run state changed. Refresh and try again.');
      if (run.status === 'completed' || run.status === 'stopped') throw new HttpError(409, 'This run has ended. Start a new run from its scenario.');
      if (p[2] === 'decisions') { const body = z.object({ ambulanceId: z.string(), hospitalId: z.string() }).parse(raw); decide(run, body.ambulanceId, body.hospitalId); }
      else { const body = controlSchema.parse(raw);
        if (body.action === 'advance') advance(run, body.minutes ?? 1);
        if (body.action === 'pause') run.status = 'paused';
        if (body.action === 'resume') run.status = 'running';
        if (body.action === 'stop') run.status = 'stopped';
        if (body.action === 'policy') { run.config.policy = z.enum(['nearest', 'coordinated']).parse(body.policy); record(run, 'policy', `Destination policy changed to ${run.config.policy}.`); }
        if (body.action === 'manual') { run.config.manual = z.boolean().parse(body.manual); record(run, 'approval_mode', `Dispatcher approval ${run.config.manual ? 'enabled' : 'disabled'} for simulated cases.`); }
        if (body.action === 'capacity') setCapacity(run, z.string().parse(body.hospitalId), z.number().int().min(0).max(6).parse(body.capacity));
      }
      await save(run, revision, previousSequence); return json(run);
    }
  }
  throw new HttpError(404, 'API endpoint not found.');
}
async function safe(request: Request) { try { return await handle(request); } catch (error) { if (error instanceof z.ZodError) return json({ error: error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') }, 400); if (error instanceof HttpError) return json({ error: error.message }, error.status); if (error instanceof SyntaxError) return json({ error: 'Invalid JSON request.' }, 400); const message = error instanceof Error ? error.message : 'Unknown error'; if (/not awaiting|constraints|not found/.test(message)) return json({ error: message }, 400); console.error(error); return json({ error: 'Unable to complete the request. Check database setup and server logs.' }, 500); } }
export const GET = safe;
export const POST = safe;
