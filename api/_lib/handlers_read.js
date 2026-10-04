// Read endpoints for /api/v1.
import { ApiError, problem, nowLocalTime, API_BASE, SITE_URL } from './http.js';
import {
  resolveRange, resolveEmployee, resolveEmployees, parseBool, parseNumber, parseEnum, parseDate,
  parseTime, isUuid,
} from './parse.js';
import {
  shiftOut, timeOffOut, eventOut, employeeOut, settingsOut, employeeWeek, dayView, dateLabel, fmt12,
  round1, storeHoursOut,
} from './format.js';
import { base, LIMITS, plural, afterContext } from './common.js';
import { listChanges, getChange, latestChangeId, changeTime } from './store.js';
import { changeOut } from './change.js';
import {
  weekStartOf, addDays, daysBetween, evaluateShift, getStoreHoursFor, checkStoreHours, shiftHours,
} from '../../src/lib/shiftRules.js';

function titleMatch(e, title) {
  return String(e.title || '').toLowerCase().includes(String(title).toLowerCase());
}

// Employee ids to filter by (from ?employee= and ?title=), or null for everyone.
function employeeFilter(query, employees) {
  let list = null;
  if (query.employee) list = resolveEmployees(query.employee, employees);
  if (query.title) list = (list || employees).filter((e) => titleMatch(e, query.title));
  return list;
}

function tentativeFilter(query) {
  if (query.tentative === undefined || query.tentative === '' || String(query.tentative).toLowerCase() === 'any') return null;
  return parseBool(query.tentative, 'tentative');
}

function pageParams(query) {
  const limit = parseNumber(query.limit, 'limit', { min: 1, max: LIMITS.list_max_limit, integer: true }) ?? LIMITS.list_default_limit;
  const offset = parseNumber(query.offset, 'offset', { min: 0, integer: true }) ?? 0;
  const order = parseEnum(query.order, 'order', ['asc', 'desc'], 'asc');
  return { limit, offset, asc: order === 'asc' };
}

function listRange(query, today) {
  const range = resolveRange(query, today, { defaultPreset: null });
  if (range && daysBetween(range.start, range.end) + 1 > LIMITS.list_max_days) {
    throw new ApiError(400, 'RANGE_TOO_LARGE', `That range is ${daysBetween(range.start, range.end) + 1} days; lists allow up to ${LIMITS.list_max_days} days per request.`, {
      hint: 'Split it into smaller ranges, or leave out start and end to page through everything with limit and offset.',
    });
  }
  return range;
}

function pageInfo(limit, offset, returned, total) {
  const next = offset + returned < total ? offset + returned : null;
  return { limit, offset, returned, total, next_offset: next, has_more: next !== null };
}

// ---------------- GET /me ----------------
export async function getMe(ctx) {
  const { settings, employees } = await base(ctx);
  let email = ctx.auth.email || null;
  if (!email) {
    const { data } = await ctx.sb.auth.admin.getUserById(ctx.auth.userId);
    email = data?.user?.email || null;
  }
  const wk = weekStartOf(ctx.today);
  return {
    status: 200,
    action: 'me.read',
    message: `Connected to ${settings?.store_name || 'the schedule'} as ${email || 'this account'}${ctx.auth.via === 'api_key' ? ` with the "${ctx.auth.key.name}" key (${ctx.auth.scopes.includes('write') ? 'read and write' : 'read only'})` : ''}. Today is ${dateLabel(ctx.today)} in Champaign.`,
    data: {
      account: { user_id: ctx.auth.userId, email, store_name: settings?.store_name || null, employee_count: employees.length },
      auth: ctx.auth.via === 'api_key'
        ? { via: 'api_key', key_name: ctx.auth.key.name, key_prefix: ctx.auth.key.prefix, access: ctx.auth.scopes.includes('write') ? 'read_write' : 'read', scopes: ctx.auth.scopes }
        : { via: 'website_session', access: 'read_write' },
      time: { timezone: 'America/Chicago', today: ctx.today, now: nowLocalTime(), weekday: dateLabel(ctx.today).slice(0, 3), this_week: { start: wk, end: addDays(wk, 6) } },
      limits: LIMITS,
      links: { website: SITE_URL, docs: `${API_BASE}/docs`, docs_page: `${SITE_URL}/api-docs`, openapi: `${API_BASE}/openapi.json` },
    },
  };
}

// ---------------- GET /settings ----------------
export async function getSettings(ctx) {
  const { settings } = await base(ctx);
  if (!settings) {
    return { status: 200, action: 'settings.read', message: 'No store settings have been saved yet.', data: { settings: null } };
  }
  return {
    status: 200,
    action: 'settings.read',
    message: `Store settings for ${settings.store_name || 'the store'}.`,
    data: { settings: settingsOut(settings) },
  };
}

// ---------------- GET /employees ----------------
export async function listEmployees(ctx) {
  const { employees } = await base(ctx);
  const q = ctx.query;
  let list = employees.map((e, i) => ({ e, i }));
  if (q.q) list = list.filter(({ e }) => String(e.name).toLowerCase().includes(String(q.q).toLowerCase()));
  if (q.title) list = list.filter(({ e }) => titleMatch(e, q.title));
  if (q.food_safety_certified !== undefined && q.food_safety_certified !== '') {
    const want = parseBool(q.food_safety_certified, 'food_safety_certified');
    list = list.filter(({ e }) => !!e.food_safety_certified === want);
  }
  const week = q.week ? weekStartOf(parseDate(q.week, 'week', ctx.today)) : weekStartOf(ctx.today);
  const shifts = await ctx.db.shifts({ start: week, end: addDays(week, 6) });
  const out = list.map(({ e, i }) => {
    const wk = employeeWeek(e, shifts, week);
    delete wk.shifts;
    return { ...employeeOut(e, i + 1), week_hours: wk };
  });
  return {
    status: 200,
    action: 'employees.list',
    message: `${plural(out.length, 'employee')}${q.q || q.title ? ' matching the filter' : ''}, in the order the website shows them. Hours are for the week of ${dateLabel(week)}.`,
    data: { employees: out, week: { start: week, end: addDays(week, 6) } },
  };
}

// ---------------- GET /employees/{id or name} ----------------
export async function getEmployee(ctx) {
  const { employees } = await base(ctx);
  const emp = resolveEmployee(decodeURIComponent(ctx.params.id), employees, 'id');
  const week = ctx.query.week ? weekStartOf(parseDate(ctx.query.week, 'week', ctx.today)) : weekStartOf(ctx.today);
  const shifts = await ctx.db.shifts({ start: week, end: addDays(week, 6), employeeIds: [emp.id] });
  const upcomingOff = await ctx.db.timeOff({ start: ctx.today, end: addDays(ctx.today, 60), employeeIds: [emp.id] });
  const idx = employees.findIndex((e) => e.id === emp.id);
  const wk = employeeWeek(emp, shifts, week);
  return {
    status: 200,
    action: 'employee.read',
    message: `${emp.name} (${emp.title || 'no title'}): ${wk.hours} counted hours in the week of ${dateLabel(week)} across ${plural(wk.shift_count, 'shift')}; ${plural(upcomingOff.length, 'time off entry', 'time off entries')} in the next 60 days.`,
    data: {
      employee: employeeOut(emp, idx + 1),
      week: wk,
      upcoming_time_off: upcomingOff.map((t) => timeOffOut(t)),
    },
  };
}

// ---------------- GET /schedule ----------------
export async function getSchedule(ctx) {
  const { db, query, today } = ctx;
  const range = resolveRange(query, today);
  const dayCount = daysBetween(range.start, range.end) + 1;
  if (dayCount > LIMITS.schedule_max_days) {
    throw new ApiError(400, 'RANGE_TOO_LARGE', `That range is ${dayCount} days; /schedule returns up to ${LIMITS.schedule_max_days} days per request.`, {
      hint: `Ask for it in pieces (for example one month at a time with preset=this_month, or start/end), or use GET /shifts with limit and offset for a flat list over any period.`,
      details: { requested: { start: range.start, end: range.end, days: dayCount }, max_days: LIMITS.schedule_max_days },
    });
  }
  const { settings, employees, empIdx } = await base(ctx);
  const filtered = employeeFilter(query, employees);
  const people = filtered || employees;
  const ids = filtered ? filtered.map((e) => e.id) : null;
  const tentative = tentativeFilter(query);
  const include = new Set(String(query.include || 'shifts,time_off,events,notes,totals').split(',').map((s) => s.trim()).filter(Boolean));

  // Whole weeks are loaded so weekly hour totals are complete even when the range starts mid week.
  const wkStart = weekStartOf(range.start);
  const wkEnd = addDays(weekStartOf(range.end), 6);
  const [weekShifts, timeOff, events] = await Promise.all([
    db.shifts({ start: wkStart, end: wkEnd, employeeIds: ids }),
    include.has('time_off') ? db.timeOff({ start: range.start, end: range.end, employeeIds: ids }) : [],
    include.has('events') ? db.events({ start: range.start, end: range.end }) : [],
  ]);
  const inRange = weekShifts.filter((s) => s.date >= range.start && s.date <= range.end
    && (tentative === null || !!s.tentative === tentative));

  const days = [];
  for (let d = range.start; d <= range.end; d = addDays(d, 1)) {
    const v = dayView(d, inRange, timeOff, settings, empIdx);
    v.is_today = d === today;
    if (!include.has('shifts')) delete v.shifts;
    if (!include.has('time_off')) delete v.time_off;
    if (include.has('events')) {
      v.events = events.filter((e) => e.start_date <= d && (e.end_date || e.start_date) >= d).map(eventOut);
    }
    days.push(v);
  }

  let totals;
  if (include.has('totals')) {
    const weeks = [];
    for (let w = wkStart; w <= wkEnd; w = addDays(w, 7)) weeks.push(w);
    totals = {
      by_employee: people.map((e) => {
        const perWeek = weeks.map((w) => {
          const wk = employeeWeek(e, weekShifts, w);
          delete wk.shifts;
          return wk;
        });
        const mine = inRange.filter((s) => s.employee_id === e.id);
        return {
          employee_id: e.id,
          employee_name: e.name,
          title: e.title || '',
          range_hours: round1(mine.filter((s) => !s.tentative).reduce((n, s) => n + shiftHours(s.start_time, s.end_time), 0)),
          range_shift_count: mine.length,
          weeks: perWeek,
        };
      }),
    };
  }

  let notes;
  if (include.has('notes')) {
    const all = settings?.metadata?.week_notes || {};
    notes = [];
    for (let w = wkStart; w <= wkEnd; w = addDays(w, 7)) {
      if (all[w]) notes.push({ week_start: w, week_end: addDays(w, 6), text: all[w] });
    }
  }

  const counted = inRange.filter((s) => !s.tentative);
  const hours = round1(counted.reduce((n, s) => n + shiftHours(s.start_time, s.end_time), 0));
  const tentCount = inRange.length - counted.length;
  const filterText = [
    filtered ? `for ${filtered.length <= 3 ? filtered.map((e) => e.name).join(', ') : plural(filtered.length, 'employee')}` : null,
    tentative === true ? 'tentative shifts only' : tentative === false ? 'confirmed shifts only' : null,
  ].filter(Boolean).join(', ');
  const span = range.start === range.end ? dateLabel(range.start) : `${dateLabel(range.start)} to ${dateLabel(range.end)}`;

  return {
    status: 200,
    action: 'schedule.read',
    message: `Schedule for ${span}${filterText ? ` (${filterText})` : ''}: ${plural(inRange.length, 'shift')}${tentCount ? ` (${tentCount} tentative)` : ''} across ${plural(new Set(inRange.map((s) => s.employee_id)).size, 'person', 'people')}, ${hours} counted hours; ${plural(timeOff.length, 'time off entry', 'time off entries')}; ${plural(events.length, 'event')}.`,
    data: {
      range: { start: range.start, end: range.end, days: dayCount, resolved_from: range.how },
      filters: { employees: filtered ? filtered.map((e) => ({ id: e.id, name: e.name })) : 'all', title: query.title || null, tentative },
      summary: { shifts: inRange.length, tentative_shifts: tentCount, counted_hours: hours, time_off_entries: timeOff.length, events: events.length },
      days,
      totals,
      notes,
      employees: people.map((e) => ({ id: e.id, name: e.name, title: e.title || '', color: e.color || null })),
    },
  };
}

// ---------------- GET /availability ----------------
export async function getAvailability(ctx) {
  const { query, today } = ctx;
  const date = parseDate(query.date, 'date', today);
  const start = parseTime(query.start_time ?? query.start, 'start_time');
  const end = parseTime(query.end_time ?? query.end, 'end_time');
  const { settings, employees, empIdx } = await base(ctx);
  const storeHours = getStoreHoursFor(settings, date);
  const violation = checkStoreHours(storeHours, start, end);
  if (violation) {
    throw new ApiError(422, 'OUTSIDE_STORE_HOURS', `${fmt12(start)} to ${fmt12(end)} is outside store hours on ${dateLabel(date)} (${fmt12(violation.open)} to ${fmt12(violation.close)}), so nobody could be scheduled then.`, {
      hint: 'Pick a time inside store hours.', details: { store_hours: storeHoursOut(settings, date) },
    });
  }
  const wk = weekStartOf(date);
  const [shifts, timeOff] = await Promise.all([
    ctx.db.shifts({ start: wk, end: addDays(wk, 6) }),
    ctx.db.timeOff({ start: date, end: date }),
  ]);
  let people = employees;
  if (query.title) people = people.filter((e) => titleMatch(e, query.title));
  const rows = people.map((e) => {
    const ev = evaluateShift({ shift: { employee_id: e.id, date, start_time: start, end_time: end, tentative: false }, employee: e, shifts, timeOffs: timeOff, settings, today });
    const reasons = [];
    if (ev.conflict) reasons.push({ code: 'ALREADY_WORKING', message: `Already works ${fmt12(ev.conflict.start_time)} to ${fmt12(ev.conflict.end_time)} that day.`, shift_id: ev.conflict.id });
    if (ev.time_off.length) reasons.push({ code: 'TIME_OFF', message: timeOffOut(ev.time_off[0]).label });
    if (ev.unavailable) reasons.push({ code: 'MARKED_UNAVAILABLE', message: `Marked unavailable ${fmt12(ev.unavailable.start_time)} to ${fmt12(ev.unavailable.end_time)} on ${ev.unavailable.day}s.` });
    if (ev.hours_status.code === 'over_max') reasons.push({ code: 'WOULD_EXCEED_MAX', message: `Would reach ${round1(ev.weekly_hours_after)}h, over max ${e.max_hours}h.` });
    const status = ev.conflict ? 'busy' : reasons.length ? 'possible_with_warnings' : 'free';
    return {
      employee_id: e.id,
      employee_name: e.name,
      title: e.title || '',
      status,
      can_be_scheduled: !ev.conflict,
      reasons,
      weekly_hours_now: round1(ev.weekly_hours_before),
      weekly_hours_if_scheduled: round1(ev.weekly_hours_after),
      max_hours: e.max_hours ?? null,
      min_hours: e.min_hours ?? null,
      food_safety_certified: !!e.food_safety_certified,
    };
  });
  const rank = { free: 0, possible_with_warnings: 1, busy: 2 };
  rows.sort((a, b) => rank[a.status] - rank[b.status] || a.weekly_hours_now - b.weekly_hours_now);
  const free = rows.filter((r) => r.status === 'free').length;
  const maybe = rows.filter((r) => r.status === 'possible_with_warnings').length;
  return {
    status: 200,
    action: 'availability.read',
    message: `${dateLabel(date)}, ${fmt12(start)} to ${fmt12(end)}: ${free} of ${rows.length} people are free, ${maybe} could work with warnings, ${rows.length - free - maybe} are already working. Sorted with the fewest hours first.`,
    data: {
      slot: { date, start_time: start, end_time: end, hours: round1(shiftHours(start, end)), store_hours: storeHoursOut(settings, date) },
      employees: rows,
    },
  };
}

// ---------------- GET /shifts ----------------
export async function listShifts(ctx) {
  const { employees, empIdx } = await base(ctx);
  const range = listRange(ctx.query, ctx.today);
  const filtered = employeeFilter(ctx.query, employees);
  if (filtered && filtered.length === 0) {
    return { status: 200, action: 'shifts.list', message: 'No employees match that filter, so there are no shifts.', data: { shifts: [], page: pageInfo(0, 0, 0, 0) } };
  }
  const { limit, offset, asc } = pageParams(ctx.query);
  const { rows, total } = await ctx.db.shiftsPage({
    start: range?.start, end: range?.end, employeeIds: filtered?.map((e) => e.id), tentative: tentativeFilter(ctx.query),
  }, limit, offset, asc);
  const page = pageInfo(limit, offset, rows.length, total);
  return {
    status: 200,
    action: 'shifts.list',
    message: `${plural(total, 'shift')} match${total === 1 ? 'es' : ''}${range ? ` between ${range.start} and ${range.end}` : ' (all dates)'}; returning ${rows.length} starting at ${offset}.${page.has_more ? ` More remain: repeat with offset=${page.next_offset}.` : ''}`,
    data: { shifts: rows.map((s) => shiftOut(s, empIdx)), page, range: range ? { start: range.start, end: range.end } : null },
  };
}

export async function getShift(ctx) {
  const s = await ctx.db.getById('shifts', ctx.params.id);
  if (!s) throw new ApiError(404, 'NOT_FOUND', `No shift with id ${ctx.params.id}.`, { hint: 'GET /shifts or GET /schedule lists shifts with their ids.' });
  const { empIdx } = await base(ctx);
  const context = await afterContext(ctx, { dates: [s.date], employeeIds: [s.employee_id] });
  return {
    status: 200,
    action: 'shift.read',
    message: shiftOut(s, empIdx).label,
    data: { shift: shiftOut(s, empIdx), day: context.days[0], employee_week: context.employee_weeks[0] || null },
  };
}

// ---------------- GET /time-off ----------------
export async function listTimeOff(ctx) {
  const { employees, empIdx } = await base(ctx);
  const range = listRange(ctx.query, ctx.today);
  const filtered = employeeFilter(ctx.query, employees);
  const { limit, offset, asc } = pageParams(ctx.query);
  const type = ctx.query.type ? parseEnum(ctx.query.type, 'type', ['regular_off', 'custom_time_off'], null) : null;
  const fullDay = ctx.query.full_day === undefined || ctx.query.full_day === '' ? null : parseBool(ctx.query.full_day, 'full_day');
  const { rows, total } = await ctx.db.timeOffPage({
    start: range?.start, end: range?.end, employeeIds: filtered?.map((e) => e.id), type, fullDay,
  }, limit, offset, asc);
  const page = pageInfo(limit, offset, rows.length, total);
  return {
    status: 200,
    action: 'time_off.list',
    message: `${plural(total, 'time off entry', 'time off entries')} match${range ? ` between ${range.start} and ${range.end}` : ' (all dates)'}; returning ${rows.length}.${page.has_more ? ` More remain: repeat with offset=${page.next_offset}.` : ''}`,
    data: { time_off: rows.map((t) => timeOffOut(t, empIdx)), page },
  };
}

export async function getTimeOff(ctx) {
  const t = await ctx.db.getById('time_off', ctx.params.id);
  if (!t) throw new ApiError(404, 'NOT_FOUND', `No time off entry with id ${ctx.params.id}.`, { hint: 'GET /time-off lists entries with their ids.' });
  const { empIdx } = await base(ctx);
  const out = timeOffOut(t, empIdx);
  return { status: 200, action: 'time_off.read', message: out.label, data: { time_off: out } };
}

// ---------------- GET /events ----------------
export async function listEvents(ctx) {
  const range = listRange(ctx.query, ctx.today);
  const { limit, offset, asc } = pageParams(ctx.query);
  const { rows, total } = await ctx.db.eventsPage({ start: range?.start, end: range?.end }, limit, offset, asc);
  const page = pageInfo(limit, offset, rows.length, total);
  return {
    status: 200,
    action: 'events.list',
    message: `${plural(total, 'event')}${range ? ` overlapping ${range.start} to ${range.end}` : ' (all dates)'}; returning ${rows.length}.`,
    data: { events: rows.map(eventOut), page },
  };
}

export async function getEvent(ctx) {
  const e = await ctx.db.getById('events', ctx.params.id);
  if (!e) throw new ApiError(404, 'NOT_FOUND', `No event with id ${ctx.params.id}.`, { hint: 'GET /events lists events with their ids.' });
  const out = eventOut(e);
  return { status: 200, action: 'event.read', message: out.label, data: { event: out } };
}

// ---------------- GET /notes ----------------
export async function listNotes(ctx) {
  const { settings } = await base(ctx);
  const all = settings?.metadata?.week_notes || {};
  let weeks = Object.keys(all).sort();
  const q = ctx.query;
  let how = 'all';
  if (q.week || q.date) {
    const w = weekStartOf(parseDate(q.week || q.date, q.week ? 'week' : 'date', ctx.today));
    weeks = weeks.filter((k) => k === w);
    how = `week of ${w}`;
  } else if (q.start || q.end || q.preset) {
    const r = resolveRange(q, ctx.today);
    const from = weekStartOf(r.start);
    weeks = weeks.filter((k) => k >= from && k <= r.end);
    how = `${r.start} to ${r.end}`;
  }
  const notes = weeks.map((w) => ({ week_start: w, week_end: addDays(w, 6), text: all[w], chars: String(all[w] || '').length }));
  return {
    status: 200,
    action: 'notes.list',
    message: `${plural(notes.length, 'week note')} (${how}). Notes are stored per week, keyed by the Monday.`,
    data: { notes, max_chars: LIMITS.note_max_chars },
  };
}

export async function getNote(ctx) {
  const w = weekStartOf(parseDate(ctx.params.week, 'week', ctx.today));
  const { settings } = await base(ctx);
  const text = settings?.metadata?.week_notes?.[w] ?? null;
  return {
    status: 200,
    action: 'note.read',
    message: text ? `Note for the week of ${dateLabel(w)} (${text.length} characters).` : `There is no note for the week of ${dateLabel(w)}.`,
    data: { note: { week_start: w, week_end: addDays(w, 6), text, chars: text ? text.length : 0 }, max_chars: LIMITS.note_max_chars },
  };
}

// ---------------- GET /changes ----------------
export async function listChangeLog(ctx) {
  const limit = parseNumber(ctx.query.limit, 'limit', { min: 1, max: LIMITS.changes_max_limit, integer: true }) ?? 20;
  const offset = parseNumber(ctx.query.offset, 'offset', { min: 0, integer: true }) ?? 0;
  const items = await listChanges(ctx.sb, ctx.auth.userId, { limit, offset });
  return {
    status: 200,
    action: 'changes.list',
    message: `${plural(items.length, 'change')} made through the API, newest first${items.length === limit ? `; more may exist (offset=${offset + limit})` : ''}. Changes made on the website itself are not in this log.`,
    data: { changes: items.map(changeOut), page: { limit, offset, returned: items.length } },
  };
}

export async function getLatestChange(ctx) {
  const id = await latestChangeId(ctx.sb, ctx.auth.userId);
  return {
    status: 200,
    action: 'changes.latest',
    message: id ? `Latest API change: ${id} at ${changeTime(id)}.` : 'No changes have been made through the API yet.',
    data: { latest_change_id: id, latest_change_at: id ? changeTime(id) : null },
  };
}

export async function getChangeById(ctx) {
  const c = await getChange(ctx.sb, ctx.auth.userId, ctx.params.id);
  if (!c) throw new ApiError(404, 'NOT_FOUND', `No change with id ${ctx.params.id}.`, { hint: 'GET /changes lists recent changes.' });
  return {
    status: 200,
    action: 'change.read',
    message: `${c.summary} (${c.at}${c.undone_at ? `, undone at ${c.undone_at}` : ''}).`,
    data: { change: changeOut(c) },
  };
}

export { problem, isUuid };
