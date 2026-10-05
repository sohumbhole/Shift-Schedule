/**
 * /api/v1: the Shift Schedule API (one Vercel function for every endpoint).
 *
 * vercel.json rewrites /api/v1/<anything> to /api/v1?path=<anything>, and this file routes it.
 * Docs: /api/v1/docs (Markdown), /api-docs (website page), /api/v1/openapi.json.
 * Built 2026-10-04 so mom's Muse assistant can read and change the schedule with the same rules as
 * the website. See CONTEXT.md and ~/brain/wiki/atomic-wings/muse-integration.md.
 */
import { createClient } from '@supabase/supabase-js';
import {
  ApiError, problem, envelope, sendJson, sendText, setCors, readJsonBody, header, newRequestId, todayLocal,
  API_BASE, SITE_URL, API_VERSION,
} from '../_lib/http.js';
import { authenticate, requireScope } from '../_lib/auth.js';
import { scopedDb } from '../_lib/data.js';
import { parseBool } from '../_lib/parse.js';
import { getIdempotent, saveIdempotent, sha256 } from '../_lib/store.js';
import { buildOpenApi } from '../_lib/openapi.js';
import { buildApiDocs } from '../../src/lib/apiDocs.js';
import * as R from '../_lib/handlers_read.js';
import * as S from '../_lib/handlers_shifts.js';
import * as O from '../_lib/handlers_other.js';

let client = null;
function supabase() {
  if (!client) {
    const url = process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new ApiError(500, 'INTERNAL_ERROR', 'The server is missing its database settings.', { hint: 'Sohum: set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel.' });
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}

function index() {
  return {
    status: 200,
    action: 'index',
    message: 'Shift Schedule API. Send your key as "Authorization: Bearer sk_shift_..." and start with GET /me. Full guide: /docs.',
    data: {
      name: 'Shift Schedule API',
      version: API_VERSION,
      base_url: API_BASE,
      docs_markdown: `${API_BASE}/docs`,
      docs_page: `${SITE_URL}/api-docs`,
      openapi: `${API_BASE}/openapi.json`,
      get_a_key: `${SITE_URL}/Settings (API access)`,
      endpoints: ROUTES.filter((r) => !r[3]?.hidden).map(([m, path]) => `${m} /${path}`),
    },
  };
}

// Supabase's free plan pauses a project after 7 days without database queries, which would take
// the website and this API offline. A Vercel cron (vercel.json "crons") calls this once a day so the
// database always sees activity, even if nobody uses the site for weeks. It runs one tiny real query.
// A GitHub Actions schedule (.github/workflows/keepalive.yml) calls it too, as an independent backup.
async function keepalive() {
  const { error } = await supabase().from('store_settings').select('id', { count: 'exact', head: true });
  if (error) throw new ApiError(500, 'DATABASE_ERROR', `Keepalive query failed: ${error.message}`);
  return {
    status: 200,
    action: 'keepalive',
    message: 'Database reached. Called daily by a Vercel cron and by a GitHub Actions schedule so the free Supabase project never pauses for inactivity.',
    data: { ok: true, at: new Date().toISOString() },
  };
}

// [method, pattern, handler, options]. Earlier entries win, so fixed paths come before :params.
const ROUTES = [
  ['GET', '', index, { public: true }],
  ['GET', 'health', () => ({ status: 200, action: 'health', message: 'OK', data: { ok: true } }), { public: true }],
  ['GET', 'keepalive', keepalive, { public: true, hidden: true }],
  ['GET', 'docs', null, { public: true, special: 'docs' }],
  ['GET', 'openapi.json', null, { public: true, special: 'openapi' }],

  ['GET', 'me', R.getMe, { scope: 'read' }],
  ['GET', 'settings', R.getSettings, { scope: 'read' }],
  ['PATCH', 'settings', O.updateSettings, { scope: 'write' }],

  ['GET', 'schedule', R.getSchedule, { scope: 'read' }],
  ['POST', 'schedule/copy-week', S.copyWeek, { scope: 'write' }],
  ['POST', 'schedule/copy-day', S.copyDay, { scope: 'write' }],
  ['GET', 'availability', R.getAvailability, { scope: 'read' }],

  ['GET', 'shifts', R.listShifts, { scope: 'read' }],
  ['POST', 'shifts', S.createShift, { scope: 'write' }],
  ['POST', 'shifts/batch', S.batchCreateShifts, { scope: 'write' }],
  ['POST', 'shifts/clear', S.clearShifts, { scope: 'write' }],
  ['GET', 'shifts/:id', R.getShift, { scope: 'read' }],
  ['PATCH', 'shifts/:id', S.updateShift, { scope: 'write' }],
  ['DELETE', 'shifts/:id', S.deleteShift, { scope: 'write' }],

  ['GET', 'employees', R.listEmployees, { scope: 'read' }],
  ['POST', 'employees', O.createEmployee, { scope: 'write' }],
  ['GET', 'employees/:id', R.getEmployee, { scope: 'read' }],
  ['PATCH', 'employees/:id', O.updateEmployee, { scope: 'write' }],
  ['DELETE', 'employees/:id', O.deleteEmployee, { scope: 'write' }],

  ['GET', 'time-off', R.listTimeOff, { scope: 'read' }],
  ['POST', 'time-off', O.createTimeOff, { scope: 'write' }],
  ['GET', 'time-off/:id', R.getTimeOff, { scope: 'read' }],
  ['PATCH', 'time-off/:id', O.updateTimeOff, { scope: 'write' }],
  ['DELETE', 'time-off/:id', O.deleteTimeOff, { scope: 'write' }],

  ['GET', 'events', R.listEvents, { scope: 'read' }],
  ['POST', 'events', O.createEvent, { scope: 'write' }],
  ['GET', 'events/:id', R.getEvent, { scope: 'read' }],
  ['PATCH', 'events/:id', O.updateEvent, { scope: 'write' }],
  ['DELETE', 'events/:id', O.deleteEvent, { scope: 'write' }],

  ['GET', 'notes', R.listNotes, { scope: 'read' }],
  ['GET', 'notes/:week', R.getNote, { scope: 'read' }],
  ['PUT', 'notes/:week', O.putNote, { scope: 'write' }],
  ['DELETE', 'notes/:week', O.deleteNote, { scope: 'write' }],

  ['GET', 'changes', R.listChangeLog, { scope: 'read' }],
  ['GET', 'changes/latest', R.getLatestChange, { scope: 'read' }],
  ['GET', 'changes/:id', R.getChangeById, { scope: 'read' }],
  ['POST', 'changes/:id/undo', O.undo, { scope: 'write' }],

  ['GET', 'tokens', O.listKeys, { scope: 'keys', hidden: true }],
  ['POST', 'tokens', O.createKey, { scope: 'keys', hidden: true }],
  ['DELETE', 'tokens/:id', O.revokeKey, { scope: 'keys', hidden: true }],
];

function routePath(req) {
  let path = req.query?.path;
  if (Array.isArray(path)) path = path.join('/');
  if (path === undefined || path === null) {
    const url = String(req.url || '').split('?')[0];
    path = url.replace(/^\/api\/v1\/?/, '');
  }
  return String(path).replace(/^\/+|\/+$/g, '');
}

function match(method, path) {
  const parts = path === '' ? [] : path.split('/');
  const allowed = new Set();
  for (const [m, pattern, fn, opts] of ROUTES) {
    const pp = pattern === '' ? [] : pattern.split('/');
    if (pp.length !== parts.length) continue;
    const params = {};
    let hit = true;
    for (let i = 0; i < pp.length; i++) {
      if (pp[i].startsWith(':')) params[pp[i].slice(1)] = decodeURIComponent(parts[i]);
      else if (pp[i] !== parts[i]) { hit = false; break; }
    }
    if (!hit) continue;
    const mm = method === 'PUT' && m === 'PATCH' ? 'PUT' : m;
    if (mm === method || (method === 'HEAD' && m === 'GET')) return { fn, opts: opts || {}, params, pattern };
    allowed.add(m);
  }
  return { allowed: [...allowed] };
}

export default async function handler(req, res) {
  setCors(res);
  const started = Date.now();
  const method = String(req.method || 'GET').toUpperCase();
  if (method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const query = { ...(req.query || {}) };
  delete query.path;
  const path = routePath(req);
  const ctx = {
    req, res, query, params: {}, body: {}, method, path,
    requestId: newRequestId(), today: todayLocal(), dryRun: false, extraWarnings: [],
    auth: null, sb: null, db: null,
  };
  let action = 'request';
  let status = 500;

  try {
    const m = match(method, path);
    if (!m.fn && !m.opts) {
      if (m.allowed.length) {
        throw new ApiError(405, 'METHOD_NOT_ALLOWED', `${method} is not supported on /${path}. Allowed: ${m.allowed.join(', ')}.`);
      }
      throw new ApiError(404, 'ROUTE_NOT_FOUND', `There is no endpoint /${path}.`, { hint: `See ${API_BASE}/docs for every endpoint, or GET ${API_BASE} for a list.` });
    }
    ctx.params = m.params;

    if (m.opts.special === 'docs') {
      status = 200;
      sendText(res, 200, 'text/markdown; charset=utf-8', buildApiDocs(SITE_URL));
      return;
    }
    if (m.opts.special === 'openapi') {
      status = 200;
      sendText(res, 200, 'application/json; charset=utf-8', JSON.stringify(buildOpenApi(), null, 2));
      return;
    }

    if (!m.opts.public) {
      ctx.sb = supabase();
      ctx.auth = await authenticate(req, ctx.sb, query);
      requireScope(ctx.auth, m.opts.scope || 'read');
      ctx.db = scopedDb(ctx.sb, ctx.auth.userId);
    }
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      ctx.body = await readJsonBody(req);
      if (Array.isArray(ctx.body) || typeof ctx.body !== 'object') {
        throw new ApiError(400, 'INVALID_JSON', 'The request body must be a JSON object.');
      }
      ctx.dryRun = parseBool(ctx.body.dry_run ?? query.dry_run, 'dry_run', false);
    }

    // Safe retries: same Idempotency-Key + same request = same answer, done once.
    const idemKey = header(req, 'idempotency-key');
    let fingerprint = null;
    if (idemKey && ctx.auth && !ctx.dryRun && method !== 'GET') {
      fingerprint = sha256(`${method} ${path} ${JSON.stringify(ctx.body)}`);
      const saved = await getIdempotent(ctx.sb, ctx.auth.userId, idemKey);
      if (saved && Date.now() - Date.parse(saved.created_at) < 24 * 3600 * 1000) {
        if (saved.fingerprint !== fingerprint) {
          throw new ApiError(409, 'IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used for a different request.', { hint: 'Use a new unique key for each different change.' });
        }
        const replay = { ...saved.body, meta: { ...saved.body.meta, idempotent_replay: true, request_id: ctx.requestId } };
        status = saved.status;
        sendJson(res, saved.status, replay);
        return;
      }
    }

    const result = await m.fn(ctx);
    action = result.action || action;
    status = result.status || 200;
    const errors = result.errors || [];
    const warnings = [...(result.warnings || []), ...ctx.extraWarnings];
    const body = envelope(ctx, {
      ok: errors.length === 0 && status < 400,
      status,
      action,
      message: result.message,
      data: result.data ?? null,
      warnings,
      errors,
      meta: ctx.dryRun ? { dry_run: true } : {},
    });
    if (fingerprint && body.ok) {
      try {
        await saveIdempotent(ctx.sb, ctx.auth.userId, idemKey, { fingerprint, status, body, created_at: new Date().toISOString() });
      } catch (e) {
        console.warn('saveIdempotent failed', e.message);
      }
    }
    sendJson(res, status, body);
  } catch (err) {
    if (err instanceof ApiError) {
      status = err.status;
      sendJson(res, status, envelope(ctx, {
        ok: false, status, action, message: err.message,
        data: err.extra?.data ?? null,
        warnings: ctx.extraWarnings,
        errors: [problem(err.code, err.message, err.extra || {})],
      }));
    } else {
      status = 500;
      console.error(`[${ctx.requestId}] ${method} /${path}`, err);
      sendJson(res, 500, envelope(ctx, {
        ok: false, status: 500, action, message: 'Something went wrong on the server. Nothing may have been saved; check before retrying.',
        errors: [problem('INTERNAL_ERROR', String(err?.message || err), { hint: `Safe to retry once. If it keeps happening, report request ${ctx.requestId}.` })],
      }));
    }
  } finally {
    console.log(JSON.stringify({ rid: ctx.requestId, method, path: `/${path}`, status, via: ctx.auth?.via || null, user: ctx.auth?.userId?.slice(0, 8) || null, ms: Date.now() - started, dry: ctx.dryRun || undefined }));
  }
}
