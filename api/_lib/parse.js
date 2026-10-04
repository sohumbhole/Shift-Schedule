// Input parsing for /api/v1: dates, times, numbers, booleans, employee lookup by name or id.
// Every failure throws an ApiError whose message and hint tell the caller exactly how to fix it.
import { ApiError } from './http.js';
import { isDateString, addDays, weekStartOf } from '../../src/lib/shiftRules.js';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v) {
  return typeof v === 'string' && UUID_RE.test(v);
}

// Accepts "YYYY-MM-DD", an ISO date time (the date part is used), "today", "tomorrow", "yesterday".
export function parseDate(value, field, today, { required = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (!required) return null;
    throw new ApiError(400, 'MISSING_FIELD', `"${field}" is required.`, {
      field, hint: `Send "${field}" as a date like "${today}", or "today" / "tomorrow".`,
    });
  }
  const v = String(value).trim().toLowerCase();
  if (v === 'today') return today;
  if (v === 'tomorrow') return addDays(today, 1);
  if (v === 'yesterday') return addDays(today, -1);
  const candidate = /^\d{4}-\d{2}-\d{2}T/.test(v) ? v.slice(0, 10) : v;
  if (isDateString(candidate)) return candidate;
  throw new ApiError(400, 'INVALID_DATE', `"${field}" must be a real calendar date in YYYY-MM-DD form; got "${value}".`, {
    field, hint: `Example: "${today}". "today", "tomorrow" and "yesterday" also work.`,
  });
}

// Accepts "17:00", "17:00:00", "5pm", "5 pm", "5:30pm", "5:30 PM", "noon", "midnight".
// Returns "HH:MM". Minutes must be :00, :15, :30 or :45, the same choices the website offers, so a
// shift created by the API looks and edits the same on the website.
export function parseTime(value, field, { required = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (!required) return null;
    throw new ApiError(400, 'MISSING_FIELD', `"${field}" is required.`, {
      field, hint: `Send "${field}" as 24 hour "HH:MM", for example "17:00" for 5 PM.`,
    });
  }
  const raw = String(value).trim().toLowerCase().replace(/\./g, '');
  let h;
  let m;
  if (raw === 'noon') { h = 12; m = 0; }
  else if (raw === 'midnight') { h = 0; m = 0; }
  else {
    let match = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (match) {
      h = Number(match[1]); m = Number(match[2]);
      if (h > 23 || m > 59) h = NaN;
    } else {
      match = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)$/);
      if (match) {
        h = Number(match[1]); m = match[2] ? Number(match[2]) : 0;
        if (h < 1 || h > 12 || m > 59) h = NaN;
        else {
          const pm = match[3].startsWith('p');
          if (h === 12) h = pm ? 12 : 0;
          else if (pm) h += 12;
        }
      }
    }
  }
  if (!Number.isInteger(h) || !Number.isInteger(m)) {
    throw new ApiError(400, 'INVALID_TIME', `"${field}" is not a valid time: "${value}".`, {
      field, hint: 'Use 24 hour "HH:MM" (for example "17:00" or "02:30"). "5pm", "5:30 PM", "noon" and "midnight" also work.',
    });
  }
  if (m % 15 !== 0) {
    throw new ApiError(400, 'TIME_NOT_ON_QUARTER_HOUR', `"${field}" must be on a quarter hour (:00, :15, :30 or :45); got "${value}".`, {
      field, hint: 'The website only schedules in 15 minute steps. Round to the nearest quarter hour.',
    });
  }
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function parseBool(value, field, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const v = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(v)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(v)) return false;
  throw new ApiError(400, 'INVALID_VALUE', `"${field}" must be true or false; got "${value}".`, { field });
}

export function parseNumber(value, field, { min = -Infinity, max = Infinity, integer = false, required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new ApiError(400, 'MISSING_FIELD', `"${field}" is required.`, { field });
    return null;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || (integer && !Number.isInteger(n)) || n < min || n > max) {
    const range = `${min === -Infinity ? '' : `at least ${min}`}${min !== -Infinity && max !== Infinity ? ' and ' : ''}${max === Infinity ? '' : `at most ${max}`}`;
    throw new ApiError(400, 'INVALID_VALUE', `"${field}" must be a${integer ? 'n integer' : ' number'}${range ? ` ${range}` : ''}; got "${value}".`, { field });
  }
  return n;
}

export function parseList(value) {
  if (value === undefined || value === null || value === '') return [];
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  return String(value).split(',').map((v) => v.trim()).filter(Boolean);
}

export function parseEnum(value, field, allowed, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const v = String(value).trim().toLowerCase();
  if (allowed.includes(v)) return v;
  throw new ApiError(400, 'INVALID_VALUE', `"${field}" must be one of ${allowed.map((a) => `"${a}"`).join(', ')}; got "${value}".`, { field });
}

// ---- date ranges ----

const PRESETS = ['today', 'tomorrow', 'yesterday', 'this_week', 'next_week', 'last_week', 'this_month', 'next_month', 'last_month'];

function monthBounds(dateStr, offset) {
  const [y, mo] = dateStr.split('-').map(Number);
  const first = new Date(Date.UTC(y, mo - 1 + offset, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
  return { start: first.toISOString().slice(0, 10), end: last.toISOString().slice(0, 10) };
}

// Resolves a date range from query params: preset | date | week | start + end.
// Returns { start, end, how }. Default (nothing given): this week, Monday to Sunday.
export function resolveRange(q, today, { defaultPreset = 'this_week' } = {}) {
  if (q.preset !== undefined && q.preset !== '') {
    const p = String(q.preset).trim().toLowerCase();
    if (!PRESETS.includes(p)) {
      throw new ApiError(400, 'INVALID_VALUE', `"preset" must be one of ${PRESETS.join(', ')}; got "${q.preset}".`, { field: 'preset' });
    }
    return presetRange(p, today);
  }
  if (q.date) {
    const d = parseDate(q.date, 'date', today);
    return { start: d, end: d, how: 'date' };
  }
  if (q.week) {
    const w = weekStartOf(parseDate(q.week, 'week', today));
    return { start: w, end: addDays(w, 6), how: 'week' };
  }
  if (q.start || q.end) {
    const start = parseDate(q.start || q.end, 'start', today);
    const end = parseDate(q.end || q.start, 'end', today);
    if (end < start) {
      throw new ApiError(400, 'END_BEFORE_START', `"end" (${end}) is before "start" (${start}).`, {
        hint: 'Swap them, or send only "date" for a single day.',
      });
    }
    return { start, end, how: 'start_end' };
  }
  if (defaultPreset === null) return null;
  return { ...presetRange(defaultPreset, today), how: `default_${defaultPreset}` };
}

export function presetRange(p, today) {
  const wk = weekStartOf(today);
  switch (p) {
    case 'today': return { start: today, end: today, how: 'preset' };
    case 'tomorrow': return { start: addDays(today, 1), end: addDays(today, 1), how: 'preset' };
    case 'yesterday': return { start: addDays(today, -1), end: addDays(today, -1), how: 'preset' };
    case 'this_week': return { start: wk, end: addDays(wk, 6), how: 'preset' };
    case 'next_week': return { start: addDays(wk, 7), end: addDays(wk, 13), how: 'preset' };
    case 'last_week': return { start: addDays(wk, -7), end: addDays(wk, -1), how: 'preset' };
    case 'this_month': return { ...monthBounds(today, 0), how: 'preset' };
    case 'next_month': return { ...monthBounds(today, 1), how: 'preset' };
    case 'last_month': return { ...monthBounds(today, -1), how: 'preset' };
    default: return { start: wk, end: addDays(wk, 6), how: 'preset' };
  }
}

// ---- employees ----

function norm(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Finds one employee by id or by name (exact, then first name, then starts with, then contains).
// Throws EMPLOYEE_NOT_FOUND or AMBIGUOUS_EMPLOYEE with the candidates so the caller can pick.
export function resolveEmployee(input, employees, field = 'employee') {
  if (input === undefined || input === null || String(input).trim() === '') {
    throw new ApiError(400, 'MISSING_FIELD', `"${field}" is required (an employee name or id).`, {
      field, hint: 'GET /employees lists everyone with their ids.',
    });
  }
  const raw = String(input).trim();
  if (isUuid(raw)) {
    const byId = employees.find((e) => e.id === raw);
    if (byId) return byId;
    throw new ApiError(404, 'EMPLOYEE_NOT_FOUND', `No employee has id ${raw}.`, {
      field, hint: 'GET /employees lists everyone with their ids.',
      details: { employees: employees.map((e) => ({ id: e.id, name: e.name })) },
    });
  }
  const q = norm(raw);
  const tiers = [
    (e) => norm(e.name) === q,
    (e) => norm(e.name).split(' ')[0] === q,
    (e) => norm(e.name).startsWith(q),
    (e) => norm(e.name).includes(q),
  ];
  for (const test of tiers) {
    const hits = employees.filter(test);
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) {
      throw new ApiError(409, 'AMBIGUOUS_EMPLOYEE', `"${raw}" matches ${hits.length} employees: ${hits.map((e) => e.name).join(', ')}.`, {
        field, hint: 'Use the full name or the employee id.',
        details: { candidates: hits.map((e) => ({ id: e.id, name: e.name, title: e.title })) },
      });
    }
  }
  throw new ApiError(404, 'EMPLOYEE_NOT_FOUND', `No employee matches "${raw}".`, {
    field, hint: 'Check the spelling, or use one of the names listed in details.',
    details: { employees: employees.map((e) => ({ id: e.id, name: e.name })) },
  });
}

// Resolves a comma separated list of names or ids. Returns [] when nothing was given.
export function resolveEmployees(input, employees, field = 'employee') {
  return parseList(input).map((x) => resolveEmployee(x, employees, field));
}
