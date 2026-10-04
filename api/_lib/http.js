// HTTP plumbing for /api/v1: the response envelope, errors, CORS, body parsing, local time.
// Files under api/_lib are bundled into the function that imports them; Vercel does not deploy
// underscore folders as functions of their own.
import crypto from 'node:crypto';

export const API_VERSION = '1';
export const TIMEZONE = 'America/Chicago';
export const SITE_URL = (process.env.VITE_APP_BASE_URL || 'https://shift-schedule-website.vercel.app').replace(/\/+$/, '');
export const API_BASE = `${SITE_URL}/api/v1`;

export class ApiError extends Error {
  // status: HTTP status. code: stable machine code. message: plain English for Muse or a person.
  // extra: { hint, field, details, errors, warnings, data }
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export function problem(code, message, extra = {}) {
  const p = { code, message };
  if (extra.field) p.field = extra.field;
  if (extra.hint) p.hint = extra.hint;
  if (extra.details !== undefined) p.details = extra.details;
  return p;
}

export function newRequestId() {
  return `req_${crypto.randomBytes(6).toString('hex')}`;
}

// "YYYY-MM-DD" for today in Champaign.
export function todayLocal() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date());
}

// "HH:MM" right now in Champaign.
export function nowLocalTime() {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false })
    .format(new Date());
}

export function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-API-Key, Idempotency-Key');
  res.setHeader('Access-Control-Max-Age', '86400');
}

export function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export function sendText(res, status, contentType, text, cacheSeconds = 300) {
  res.statusCode = status;
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', `public, max-age=${cacheSeconds}`);
  res.end(text);
}

// Builds the envelope every JSON response uses.
export function envelope(ctx, { ok, status, action, message, data = null, warnings = [], errors = [], meta = {} }) {
  return {
    ok,
    status,
    action,
    message,
    data,
    warnings,
    errors,
    meta: {
      request_id: ctx.requestId,
      api_version: API_VERSION,
      timezone: TIMEZONE,
      today: ctx.today,
      generated_at: new Date().toISOString(),
      docs: `${API_BASE}/docs`,
      ...meta,
    },
  };
}

export async function readJsonBody(req) {
  let raw = req.body;
  if (raw === undefined || raw === null) {
    raw = await new Promise((resolve, reject) => {
      let buf = '';
      req.setEncoding?.('utf8');
      req.on?.('data', (chunk) => { buf += chunk; });
      req.on?.('end', () => resolve(buf));
      req.on?.('error', reject);
      if (!req.on) resolve('');
    });
  }
  if (Buffer.isBuffer(raw)) raw = raw.toString('utf8');
  if (typeof raw === 'string') {
    if (raw.trim() === '') return {};
    try {
      return JSON.parse(raw);
    } catch {
      throw new ApiError(400, 'INVALID_JSON', 'The request body is not valid JSON.', {
        hint: 'Send a JSON object, for example {"employee": "Arpit", "date": "2026-10-10", "start_time": "17:00", "end_time": "23:00"}, with Content-Type: application/json.',
      });
    }
  }
  if (raw && typeof raw === 'object') return raw;
  return {};
}

export function header(req, name) {
  const v = req.headers?.[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}
