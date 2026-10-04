// Write endpoints for time off, events, employees, week notes, store settings, undo, and API keys.
import { ApiError, problem } from './http.js';
import { resolveEmployee, parseDate, parseTime, parseBool, parseNumber, parseEnum, isUuid } from './parse.js';
import { timeOffOut, eventOut, employeeOut, settingsOut, shiftOut, dateLabel, fmt12 } from './format.js';
import { base, LIMITS, plural, afterContext, unknownFieldWarnings, EMPLOYEE_COLORS } from './common.js';
import { recordChange, stripRow, undoChange, changeOut } from './change.js';
import { createApiKey, listApiKeys, revokeApiKey } from './store.js';
import {
  addDays, daysBetween, weekStartOf, getStoreHoursFor, shiftSpan, DAY_KEYS, DAY_NAMES,
} from '../../src/lib/shiftRules.js';

// ================= TIME OFF =================
const TIME_OFF_FIELDS = ['employee', 'employee_id', 'date', 'start_date', 'end_date', 'type', 'full_day', 'start_time', 'end_time', 'reason', 'dry_run'];

function timeOffTimes(b, settings, date, fullDay) {
  if (fullDay) {
    // Same as the website: a full day off stores that day's store hours (or 00:00 to 23:59).
    const h = getStoreHoursFor(settings, date);
    return { start_time: h?.open || '00:00', end_time: h?.close || '23:59' };
  }
  return { start_time: parseTime(b.start_time, 'start_time'), end_time: parseTime(b.end_time, 'end_time') };
}

async function timeOffWarnings(ctx, employee, dates, entry) {
  const warnings = [];
  const [shifts, offs] = await Promise.all([
    ctx.db.shifts({ start: dates[0], end: dates[dates.length - 1], employeeIds: [employee.id] }),
    ctx.db.timeOff({ start: dates[0], end: dates[dates.length - 1], employeeIds: [employee.id] }),
  ]);
  for (const s of shifts) {
    if (!dates.includes(s.date)) continue;
    const overlaps = entry.full_day || (() => {
      const a = shiftSpan(entry.start_time, entry.end_time);
      const b = shiftSpan(s.start_time, s.end_time);
      return a.start < b.end && a.end > b.start;
    })();
    if (overlaps) warnings.push(problem('SHIFT_DURING_TIME_OFF', `${employee.name} is scheduled ${fmt12(s.start_time)} to ${fmt12(s.end_time)} on ${dateLabel(s.date)}, during this time off. The shift was not changed.`, { hint: `Remove it with DELETE /shifts/${s.id} or move it with PATCH /shifts/${s.id} if needed.`, details: { shift: shiftOut(s) } }));
  }
  for (const t of offs) {
    if (entry.ignoreId && t.id === entry.ignoreId) continue;
    if (dates.includes(t.start_date)) warnings.push(problem('DUPLICATE_TIME_OFF', `${employee.name} already has time off on ${dateLabel(t.start_date)} (${timeOffOut(t).type_label}).`, { details: { time_off: timeOffOut(t) } }));
  }
  if (dates[0] < ctx.today) warnings.push(problem('PAST_DATE', `This time off includes past dates (today is ${dateLabel(ctx.today)}).`));
  return warnings;
}

export async function createTimeOff(ctx) {
  const b = ctx.body;
  const warnings = unknownFieldWarnings(b, TIME_OFF_FIELDS);
  const { settings, employees, empIdx } = await base(ctx);
  const emp = resolveEmployee(b.employee ?? b.employee_id, employees);
  const start = parseDate(b.start_date ?? b.date, b.start_date ? 'start_date' : 'date', ctx.today);
  const end = b.end_date ? parseDate(b.end_date, 'end_date', ctx.today) : start;
  if (end < start) throw new ApiError(400, 'END_BEFORE_START', `"end_date" (${end}) is before the start (${start}).`, { field: 'end_date' });
  const span = daysBetween(start, end) + 1;
  if (span > LIMITS.time_off_max_days) throw new ApiError(400, 'RANGE_TOO_LARGE', `Time off can cover up to ${LIMITS.time_off_max_days} days per request; that is ${span}.`, { hint: 'Send it in parts.' });
  const type = parseEnum(b.type, 'type', ['regular_off', 'custom_time_off'], 'regular_off');
  const fullDay = parseBool(b.full_day, 'full_day', true);
  const reason = b.reason ? String(b.reason).slice(0, 500) : '';
  const dates = [];
  for (let d = start; d <= end; d = addDays(d, 1)) dates.push(d);
  const rows = dates.map((date) => ({
    employee_id: emp.id, employee_name: emp.name, start_date: date, type, full_day: fullDay, reason,
    ...timeOffTimes(b, settings, date, fullDay),
  }));
  warnings.push(...await timeOffWarnings(ctx, emp, dates, { full_day: fullDay, start_time: rows[0].start_time, end_time: rows[0].end_time }));

  if (ctx.dryRun) {
    return { status: 200, action: 'time_off.create', message: `Dry run: would add ${plural(rows.length, 'time off entry', 'time off entries')} for ${emp.name}. Nothing was saved.`, data: { would_create: rows.map((r) => timeOffOut(r, empIdx)) }, warnings };
  }
  const created = await ctx.db.insert('time_off', rows);
  const out = created.map((t) => timeOffOut(t, empIdx));
  const change = await recordChange(ctx, {
    action: 'time_off.create', summary: `Added ${out.length === 1 ? out[0].label : `${out.length} days of ${out[0].type_label.toLowerCase()} for ${emp.name} (${start} to ${end})`}`,
    entity: 'time_off', entity_ids: created.map((t) => t.id), after: out,
    inverse: [{ op: 'delete', table: 'time_off', ids: created.map((t) => t.id), expect: created }],
  });
  const context = await afterContext(ctx, { dates: dates.slice(0, 14), employeeIds: [emp.id] });
  return {
    status: 201, action: 'time_off.create',
    message: `Added ${out.length === 1 ? out[0].label : `${out.length} days of ${out[0].type_label.toLowerCase()} for ${emp.name}, ${dateLabel(start)} to ${dateLabel(end)}`}.`,
    data: { time_off: out, employee_weeks: context.employee_weeks, change },
    warnings,
  };
}

export async function updateTimeOff(ctx) {
  const b = ctx.body;
  const warnings = unknownFieldWarnings(b, TIME_OFF_FIELDS.filter((f) => f !== 'end_date'));
  const existing = await ctx.db.getById('time_off', ctx.params.id);
  if (!existing) throw new ApiError(404, 'NOT_FOUND', `No time off entry with id ${ctx.params.id}.`, { hint: 'GET /time-off lists entries with their ids.' });
  const { settings, employees, empIdx } = await base(ctx);
  const emp = (b.employee ?? b.employee_id) !== undefined ? resolveEmployee(b.employee ?? b.employee_id, employees) : (empIdx.get(existing.employee_id) || { id: existing.employee_id, name: existing.employee_name });
  const date = (b.start_date ?? b.date) !== undefined ? parseDate(b.start_date ?? b.date, 'date', ctx.today) : existing.start_date;
  const fullDay = b.full_day !== undefined ? parseBool(b.full_day, 'full_day') : existing.full_day !== false;
  const times = fullDay
    ? timeOffTimes(b, settings, date, true)
    : { start_time: b.start_time !== undefined ? parseTime(b.start_time, 'start_time') : existing.start_time, end_time: b.end_time !== undefined ? parseTime(b.end_time, 'end_time') : existing.end_time };
  const set = {
    employee_id: emp.id, employee_name: emp.name, start_date: date,
    type: b.type !== undefined ? parseEnum(b.type, 'type', ['regular_off', 'custom_time_off']) : existing.type,
    full_day: fullDay, ...times,
    reason: b.reason !== undefined ? String(b.reason || '').slice(0, 500) : (existing.reason || ''),
  };
  const before = timeOffOut(existing, empIdx);
  warnings.push(...await timeOffWarnings(ctx, emp, [date], { full_day: fullDay, ...times, ignoreId: existing.id }));
  if (ctx.dryRun) {
    return { status: 200, action: 'time_off.update', message: `Dry run: would change "${before.label}" to "${timeOffOut({ ...existing, ...set }, empIdx).label}". Nothing was saved.`, data: { current: before, would_become: timeOffOut({ ...existing, ...set }, empIdx) }, warnings };
  }
  const updated = await ctx.db.update('time_off', existing.id, set);
  const after = timeOffOut(updated, empIdx);
  const change = await recordChange(ctx, {
    action: 'time_off.update', summary: `Changed time off from "${before.label}" to "${after.label}"`, entity: 'time_off', entity_ids: [existing.id],
    before, after, inverse: [{ op: 'update', table: 'time_off', id: existing.id, set: Object.fromEntries(Object.keys(set).map((k) => [k, existing[k]])), expect: Object.fromEntries(Object.keys(set).map((k) => [k, updated[k]])) }],
  });
  return { status: 200, action: 'time_off.update', message: `Updated. Was: ${before.label}. Now: ${after.label}.`, data: { time_off: after, before, change }, warnings };
}

export async function deleteTimeOff(ctx) {
  const existing = await ctx.db.getById('time_off', ctx.params.id);
  if (!existing) throw new ApiError(404, 'NOT_FOUND', `No time off entry with id ${ctx.params.id}.`, { hint: 'It may already be deleted.' });
  const { empIdx } = await base(ctx);
  const out = timeOffOut(existing, empIdx);
  if (ctx.dryRun) return { status: 200, action: 'time_off.delete', message: `Dry run: would delete ${out.label}.`, data: { would_delete: out } };
  await ctx.db.remove('time_off', [existing.id]);
  const change = await recordChange(ctx, {
    action: 'time_off.delete', summary: `Deleted ${out.label}`, entity: 'time_off', entity_ids: [existing.id],
    before: out, inverse: [{ op: 'insert', table: 'time_off', rows: [stripRow(existing)] }],
  });
  return { status: 200, action: 'time_off.delete', message: `Deleted ${out.label}.`, data: { deleted: out, change } };
}

// ================= EVENTS =================
const EVENT_FIELDS = ['name', 'start_date', 'end_date', 'date', 'all_day', 'start_time', 'end_time', 'notes', 'color', 'dry_run'];

function parseColor(v, field = 'color') {
  if (v === undefined || v === null || v === '') return null;
  if (!/^#[0-9a-f]{6}$/i.test(String(v))) throw new ApiError(400, 'INVALID_VALUE', `"${field}" must be a hex color like "#8B5CF6"; got "${v}".`, { field });
  return String(v);
}

function eventFields(b, existing, today) {
  const startDate = (b.start_date ?? b.date) !== undefined ? parseDate(b.start_date ?? b.date, 'start_date', today) : existing?.start_date;
  if (!startDate) throw new ApiError(400, 'MISSING_FIELD', '"start_date" is required.', { field: 'start_date' });
  const endDate = b.end_date !== undefined ? parseDate(b.end_date, 'end_date', today) : (existing ? (existing.end_date || existing.start_date) : startDate);
  if (endDate < startDate) throw new ApiError(400, 'END_BEFORE_START', `"end_date" (${endDate}) is before "start_date" (${startDate}).`, { field: 'end_date' });
  const allDay = b.all_day !== undefined ? parseBool(b.all_day, 'all_day') : (existing ? existing.all_day !== false : true);
  const name = b.name !== undefined ? String(b.name).trim() : existing?.name;
  if (!name) throw new ApiError(400, 'MISSING_FIELD', '"name" is required.', { field: 'name' });
  return {
    name: name.slice(0, 200),
    start_date: startDate,
    end_date: endDate,
    all_day: allDay,
    start_time: b.start_time !== undefined ? parseTime(b.start_time, 'start_time') : (existing?.start_time || '09:00'),
    end_time: b.end_time !== undefined ? parseTime(b.end_time, 'end_time') : (existing?.end_time || '17:00'),
    notes: b.notes !== undefined ? String(b.notes || '').slice(0, 2000) : (existing?.notes || ''),
    color: parseColor(b.color) || existing?.color || '#8B5CF6',
  };
}

export async function createEvent(ctx) {
  const warnings = unknownFieldWarnings(ctx.body, EVENT_FIELDS);
  const row = eventFields(ctx.body, null, ctx.today);
  if (ctx.dryRun) return { status: 200, action: 'event.create', message: `Dry run: would add ${eventOut(row).label}.`, data: { would_create: eventOut(row) }, warnings };
  const [created] = await ctx.db.insert('events', [row]);
  const out = eventOut(created);
  const change = await recordChange(ctx, { action: 'event.create', summary: `Added event ${out.label}`, entity: 'event', entity_ids: [created.id], after: out, inverse: [{ op: 'delete', table: 'events', ids: [created.id], expect: [created] }] });
  return { status: 201, action: 'event.create', message: `Added event ${out.label}.`, data: { event: out, change }, warnings };
}

export async function updateEvent(ctx) {
  const warnings = unknownFieldWarnings(ctx.body, EVENT_FIELDS);
  const existing = await ctx.db.getById('events', ctx.params.id);
  if (!existing) throw new ApiError(404, 'NOT_FOUND', `No event with id ${ctx.params.id}.`, { hint: 'GET /events lists events with their ids.' });
  const set = eventFields(ctx.body, existing, ctx.today);
  const before = eventOut(existing);
  if (ctx.dryRun) return { status: 200, action: 'event.update', message: `Dry run: would change "${before.label}" to "${eventOut({ ...existing, ...set }).label}".`, data: { current: before, would_become: eventOut({ ...existing, ...set }) }, warnings };
  const updated = await ctx.db.update('events', existing.id, set);
  const after = eventOut(updated);
  const change = await recordChange(ctx, { action: 'event.update', summary: `Changed event "${before.label}" to "${after.label}"`, entity: 'event', entity_ids: [existing.id], before, after, inverse: [{ op: 'update', table: 'events', id: existing.id, set: Object.fromEntries(Object.keys(set).map((k) => [k, existing[k]])), expect: Object.fromEntries(Object.keys(set).map((k) => [k, updated[k]])) }] });
  return { status: 200, action: 'event.update', message: `Updated. Was: ${before.label}. Now: ${after.label}.`, data: { event: after, before, change }, warnings };
}

export async function deleteEvent(ctx) {
  const existing = await ctx.db.getById('events', ctx.params.id);
  if (!existing) throw new ApiError(404, 'NOT_FOUND', `No event with id ${ctx.params.id}.`, { hint: 'It may already be deleted.' });
  const out = eventOut(existing);
  if (ctx.dryRun) return { status: 200, action: 'event.delete', message: `Dry run: would delete event ${out.label}.`, data: { would_delete: out } };
  await ctx.db.remove('events', [existing.id]);
  const change = await recordChange(ctx, { action: 'event.delete', summary: `Deleted event ${out.label}`, entity: 'event', entity_ids: [existing.id], before: out, inverse: [{ op: 'insert', table: 'events', rows: [stripRow(existing)] }] });
  return { status: 200, action: 'event.delete', message: `Deleted event ${out.label}.`, data: { deleted: out, change } };
}

// ================= EMPLOYEES =================
const EMPLOYEE_FIELDS = ['name', 'title', 'min_hours', 'max_hours', 'available_hours', 'unavailable_hours', 'food_safety_certified', 'notes', 'color', 'dry_run'];

function parseUnavailable(v) {
  if (v === undefined) return undefined;
  if (v === null) return [];
  if (!Array.isArray(v)) throw new ApiError(400, 'INVALID_VALUE', '"unavailable_hours" must be a list like [{"day": "Saturday", "start_time": "00:00", "end_time": "23:59"}].', { field: 'unavailable_hours' });
  return v.map((blk, i) => {
    const day = DAY_NAMES.find((d) => d.toLowerCase() === String(blk?.day || '').trim().toLowerCase());
    if (!day) throw new ApiError(400, 'INVALID_VALUE', `unavailable_hours[${i}].day must be a weekday name like "Saturday"; got "${blk?.day}".`, { field: `unavailable_hours[${i}].day` });
    const allDay = String(blk.end_time || '').trim() === '23:59';
    return {
      day,
      start_time: parseTime(blk.start_time, `unavailable_hours[${i}].start_time`),
      end_time: allDay ? '23:59' : parseTime(blk.end_time, `unavailable_hours[${i}].end_time`),
    };
  });
}

function employeeFields(b, existing) {
  const out = {};
  if (b.name !== undefined || !existing) {
    const name = String(b.name ?? '').trim();
    if (!name) throw new ApiError(400, 'MISSING_FIELD', '"name" is required.', { field: 'name' });
    out.name = name.slice(0, 120);
  }
  if (b.title !== undefined || !existing) {
    const title = String(b.title ?? '').trim();
    if (!title) throw new ApiError(400, 'MISSING_FIELD', '"title" is required (for example "cook" or "cashier"), like on the website.', { field: 'title' });
    out.title = title.slice(0, 120);
  }
  if (b.min_hours !== undefined || !existing) {
    out.min_hours = parseNumber(b.min_hours, 'min_hours', { min: 0, max: 168, required: true });
  }
  if (b.max_hours !== undefined) out.max_hours = b.max_hours === null || b.max_hours === '' ? null : parseNumber(b.max_hours, 'max_hours', { min: 0, max: 168 });
  const min = out.min_hours ?? existing?.min_hours;
  const max = out.max_hours !== undefined ? out.max_hours : existing?.max_hours;
  if (max !== null && max !== undefined && min !== null && min !== undefined && max < min) {
    throw new ApiError(400, 'INVALID_VALUE', `"max_hours" (${max}) cannot be less than "min_hours" (${min}).`, { field: 'max_hours' });
  }
  if (b.available_hours !== undefined) out.available_hours = String(b.available_hours || '').slice(0, 500);
  const unav = parseUnavailable(b.unavailable_hours);
  if (unav !== undefined) out.unavailable_hours = unav;
  if (b.food_safety_certified !== undefined) out.food_safety_certified = parseBool(b.food_safety_certified, 'food_safety_certified');
  if (b.notes !== undefined) out.notes = String(b.notes || '').slice(0, 2000);
  if (b.color !== undefined) out.color = parseColor(b.color);
  return out;
}

export async function createEmployee(ctx) {
  const warnings = unknownFieldWarnings(ctx.body, EMPLOYEE_FIELDS);
  const { employees } = await base(ctx);
  const row = employeeFields(ctx.body, null);
  if (!row.color) {
    const used = new Set(employees.map((e) => e.color));
    row.color = EMPLOYEE_COLORS.find((c) => !used.has(c)) || EMPLOYEE_COLORS[employees.length % EMPLOYEE_COLORS.length];
  }
  row.available_hours = row.available_hours ?? '';
  row.notes = row.notes ?? '';
  row.unavailable_hours = row.unavailable_hours ?? [];
  row.food_safety_certified = row.food_safety_certified ?? false;
  if (employees.some((e) => e.name.trim().toLowerCase() === row.name.toLowerCase())) {
    warnings.push(problem('DUPLICATE_EMPLOYEE_NAME', `There is already an employee named "${row.name}". Names that match exactly make it harder to refer to people by name.`));
  }
  if (ctx.dryRun) return { status: 200, action: 'employee.create', message: `Dry run: would add ${row.name} (${row.title}).`, data: { would_create: employeeOut(row) }, warnings };
  const [created] = await ctx.db.insert('employees', [row]);
  const change = await recordChange(ctx, { action: 'employee.create', summary: `Added employee ${created.name} (${created.title})`, entity: 'employee', entity_ids: [created.id], after: employeeOut(created), inverse: [{ op: 'delete', table: 'employees', ids: [created.id], expect: [created] }] });
  return { status: 201, action: 'employee.create', message: `Added employee ${created.name} (${created.title}). They appear at the end of the list on the website until reordered.`, data: { employee: employeeOut(created), change }, warnings };
}

export async function updateEmployee(ctx) {
  const warnings = unknownFieldWarnings(ctx.body, EMPLOYEE_FIELDS);
  const { employees } = await base(ctx);
  const emp = resolveEmployee(decodeURIComponent(ctx.params.id), employees, 'id');
  const set = employeeFields(ctx.body, emp);
  if (!Object.keys(set).length) return { status: 200, action: 'employee.update', message: `Nothing to change for ${emp.name}.`, data: { employee: employeeOut(emp) }, warnings };
  const before = employeeOut(emp);
  if (ctx.dryRun) return { status: 200, action: 'employee.update', message: `Dry run: would update ${emp.name} (${Object.keys(set).join(', ')}).`, data: { current: before, would_become: employeeOut({ ...emp, ...set }) }, warnings };
  const updated = await ctx.db.update('employees', emp.id, set);
  const change = await recordChange(ctx, { action: 'employee.update', summary: `Updated ${emp.name}: ${Object.keys(set).join(', ')}`, entity: 'employee', entity_ids: [emp.id], before, after: employeeOut(updated), inverse: [{ op: 'update', table: 'employees', id: emp.id, set: Object.fromEntries(Object.keys(set).map((k) => [k, emp[k]])), expect: Object.fromEntries(Object.keys(set).map((k) => [k, updated[k]])) }] });
  return { status: 200, action: 'employee.update', message: `Updated ${updated.name}: ${Object.keys(set).join(', ')}.`, data: { employee: employeeOut(updated), before, change }, warnings };
}

export async function deleteEmployee(ctx) {
  const { employees } = await base(ctx);
  const emp = resolveEmployee(decodeURIComponent(ctx.params.id), employees, 'id');
  const confirm = parseBool(ctx.body?.confirm ?? ctx.query.confirm, 'confirm', false);
  const [shifts, offs] = await Promise.all([ctx.db.shifts({ employeeIds: [emp.id] }), ctx.db.timeOff({ employeeIds: [emp.id] })]);
  const summary = `${emp.name} and all of their ${plural(shifts.length, 'shift')} and ${plural(offs.length, 'time off entry', 'time off entries')}`;
  if (!confirm && !ctx.dryRun) {
    return {
      status: 409, action: 'employee.delete',
      message: `Not deleted. This removes ${summary} (the same cascade the website does). Send again with "confirm": true (or ?confirm=true).`,
      data: { employee: employeeOut(emp), would_also_delete: { shifts: shifts.length, time_off: offs.length } },
      errors: [problem('CONFIRM_REQUIRED', `Deleting ${emp.name} also deletes ${plural(shifts.length, 'shift')} and ${plural(offs.length, 'time off entry', 'time off entries')}.`, { field: 'confirm', hint: 'Add "confirm": true. It can be undone with POST /changes/{id}/undo.' })],
    };
  }
  if (ctx.dryRun) return { status: 200, action: 'employee.delete', message: `Dry run: would delete ${summary}.`, data: { would_delete: employeeOut(emp), shifts: shifts.length, time_off: offs.length } };
  await ctx.db.remove('shifts', shifts.map((s) => s.id));
  await ctx.db.remove('time_off', offs.map((t) => t.id));
  await ctx.db.remove('employees', [emp.id]);
  const change = await recordChange(ctx, {
    action: 'employee.delete', summary: `Deleted ${summary}`, entity: 'employee', entity_ids: [emp.id], before: employeeOut(emp),
    inverse: [{ op: 'restore_employee', employee: stripRow(emp), shifts: shifts.map(stripRow), time_off: offs.map(stripRow) }],
  });
  return { status: 200, action: 'employee.delete', message: `Deleted ${summary}. Undo restores all of it (with new ids): POST /changes/${change?.change_id}/undo.`, data: { deleted: employeeOut(emp), shifts_deleted: shifts.length, time_off_deleted: offs.length, change } };
}

// ================= WEEK NOTES =================
export async function putNote(ctx) {
  const warnings = unknownFieldWarnings(ctx.body, ['text', 'append', 'dry_run']);
  const week = weekStartOf(parseDate(ctx.params.week, 'week', ctx.today));
  if (ctx.body.text === undefined || ctx.body.text === null) throw new ApiError(400, 'MISSING_FIELD', '"text" is required.', { field: 'text', hint: 'To remove a note use DELETE /notes/{week}.' });
  const append = parseBool(ctx.body.append, 'append', false);
  const s = await ctx.db.settings();
  const current = s?.metadata?.week_notes?.[week] ?? null;
  const text = append && current ? `${current}\n${String(ctx.body.text)}` : String(ctx.body.text);
  if (text.length > LIMITS.note_max_chars) {
    throw new ApiError(400, 'NOTE_TOO_LONG', `Week notes hold up to ${LIMITS.note_max_chars} characters (the website's limit); this would be ${text.length}.`, { field: 'text', details: { length: text.length, max: LIMITS.note_max_chars } });
  }
  if (text === current) return { status: 200, action: 'note.set', message: `The note for the week of ${dateLabel(week)} already says exactly that.`, data: { note: { week_start: week, text } }, warnings };
  if (ctx.dryRun) return { status: 200, action: 'note.set', message: `Dry run: would ${current ? 'replace' : 'add'} the note for the week of ${dateLabel(week)}.`, data: { current, would_become: text }, warnings };
  const meta = { ...(s?.metadata || {}) };
  meta.week_notes = { ...(meta.week_notes || {}), [week]: text };
  if (s) await ctx.db.updateSettings(s.id, { metadata: meta });
  else await ctx.db.createSettings({ metadata: meta });
  const change = await recordChange(ctx, { action: 'note.set', summary: `${current ? 'Changed' : 'Added'} the note for the week of ${week}`, entity: 'note', entity_ids: [week], before: current, after: text, inverse: [{ op: 'set_note', week, text: current, expect: text }] });
  return { status: current ? 200 : 201, action: 'note.set', message: `${current ? 'Updated' : 'Added'} the note for the week of ${dateLabel(week)} (${text.length} characters).`, data: { note: { week_start: week, week_end: addDays(week, 6), text, chars: text.length }, previous: current, change }, warnings };
}

export async function deleteNote(ctx) {
  const week = weekStartOf(parseDate(ctx.params.week, 'week', ctx.today));
  const s = await ctx.db.settings();
  const current = s?.metadata?.week_notes?.[week] ?? null;
  if (!current) return { status: 200, action: 'note.delete', message: `There is no note for the week of ${dateLabel(week)}; nothing to delete.`, data: { note: null } };
  if (ctx.dryRun) return { status: 200, action: 'note.delete', message: `Dry run: would delete the note for the week of ${dateLabel(week)}.`, data: { current } };
  const meta = { ...(s.metadata || {}) };
  const notes = { ...(meta.week_notes || {}) };
  delete notes[week];
  meta.week_notes = notes;
  await ctx.db.updateSettings(s.id, { metadata: meta });
  const change = await recordChange(ctx, { action: 'note.delete', summary: `Deleted the note for the week of ${week}`, entity: 'note', entity_ids: [week], before: current, inverse: [{ op: 'set_note', week, text: current, expect: null }] });
  return { status: 200, action: 'note.delete', message: `Deleted the note for the week of ${dateLabel(week)}.`, data: { deleted: { week_start: week, text: current }, change } };
}

// ================= STORE SETTINGS =================
export async function updateSettings(ctx) {
  const b = ctx.body;
  const warnings = unknownFieldWarnings(b, ['store_name', 'manager_name', 'notes', 'hours', 'employee_order', 'dry_run']);
  const { settings, employees } = await base(ctx);
  const set = {};
  if (b.store_name !== undefined) set.store_name = String(b.store_name || '').slice(0, 200);
  if (b.manager_name !== undefined) set.manager_name = String(b.manager_name || '').slice(0, 200);
  if (b.notes !== undefined) set.notes = String(b.notes || '').slice(0, 2000);
  if (b.hours !== undefined) {
    if (!b.hours || typeof b.hours !== 'object') throw new ApiError(400, 'INVALID_VALUE', '"hours" must be an object like {"monday": {"open": "08:00", "close": "02:00"}}.', { field: 'hours' });
    for (const [day, v] of Object.entries(b.hours)) {
      const key = String(day).toLowerCase();
      if (!DAY_KEYS.includes(key)) throw new ApiError(400, 'INVALID_VALUE', `Unknown day "${day}" in "hours". Use monday through sunday.`, { field: 'hours' });
      if (v === null) { set[`${key}_open`] = null; set[`${key}_close`] = null; continue; }
      if (v.open !== undefined) set[`${key}_open`] = parseTime(v.open, `hours.${key}.open`);
      if (v.close !== undefined) set[`${key}_close`] = parseTime(v.close, `hours.${key}.close`);
    }
  }
  if (b.employee_order !== undefined) {
    if (!Array.isArray(b.employee_order)) throw new ApiError(400, 'INVALID_VALUE', '"employee_order" must be a list of employee names or ids, top to bottom.', { field: 'employee_order' });
    set.employee_order = b.employee_order.map((x) => resolveEmployee(x, employees, 'employee_order').id);
    const missing = employees.filter((e) => !set.employee_order.includes(e.id));
    if (missing.length) warnings.push(problem('EMPLOYEES_NOT_IN_ORDER', `${missing.map((e) => e.name).join(', ')} were not in "employee_order"; the website shows them after everyone listed.`));
  }
  if (!Object.keys(set).length) return { status: 200, action: 'settings.update', message: 'Nothing to change. Send store_name, manager_name, notes, hours or employee_order.', data: { settings: settingsOut(settings) }, warnings };
  if (!settings) throw new ApiError(409, 'NO_STORE_SETTINGS', 'This account has no store settings yet. Open Settings on the website once and save, then try again.');
  const before = settingsOut(settings);
  if (ctx.dryRun) return { status: 200, action: 'settings.update', message: `Dry run: would update ${Object.keys(set).join(', ')}.`, data: { current: before, would_become: settingsOut({ ...settings, ...set }) }, warnings };
  const updated = await ctx.db.updateSettings(settings.id, set);
  const change = await recordChange(ctx, { action: 'settings.update', summary: `Updated store settings: ${Object.keys(set).join(', ')}`, entity: 'settings', entity_ids: [settings.id], before, after: settingsOut(updated), inverse: [{ op: 'update_settings', set: Object.fromEntries(Object.keys(set).map((k) => [k, settings[k]])), expect: Object.fromEntries(Object.keys(set).map((k) => [k, updated[k]])) }] });
  return { status: 200, action: 'settings.update', message: `Updated store settings: ${Object.keys(set).join(', ')}.`, data: { settings: settingsOut(updated), before, change }, warnings };
}

// ================= UNDO =================
export async function undo(ctx) {
  const force = parseBool(ctx.body?.force ?? ctx.query.force, 'force', false);
  const r = await undoChange(ctx, ctx.params.id, { force });
  if (ctx.dryRun) {
    return { status: 200, action: 'change.undo', message: `Dry run: "${r.change.summary}" can be undone${r.conflicts.length ? ' (with force, because some items changed since)' : ''}. Nothing was changed.`, data: { change: changeOut(r.change) }, warnings: r.notes };
  }
  return {
    status: 200, action: 'change.undo',
    message: `Undone: ${r.change.summary}.${r.logged ? ` To redo it, undo this undo: POST /changes/${r.logged.change_id}/undo.` : ''}`,
    data: { undone: changeOut(r.change), change: r.logged },
    warnings: r.notes,
  };
}

// ================= API KEYS (website session only) =================
export async function listKeys(ctx) {
  const keys = await listApiKeys(ctx.sb, ctx.auth.userId);
  const out = keys.map((k) => ({ id: k.id, name: k.name, prefix: k.prefix, access: k.scopes.includes('write') ? 'read_write' : 'read', created_at: k.created_at, last_used_at: k.last_used_at, revoked_at: k.revoked_at, active: !k.revoked_at }));
  return { status: 200, action: 'keys.list', message: `${plural(out.filter((k) => k.active).length, 'active key')}, ${plural(out.filter((k) => !k.active).length, 'revoked key')}.`, data: { keys: out } };
}

export async function createKey(ctx) {
  const b = ctx.body;
  const name = String(b.name || '').trim().slice(0, 60) || 'Muse';
  const access = parseEnum(b.access, 'access', ['read', 'read_write', 'write'], 'read_write');
  const scopes = access === 'read' ? ['read'] : ['read', 'write'];
  const { key, record } = await createApiKey(ctx.sb, { userId: ctx.auth.userId, name, scopes });
  await recordChange(ctx, { action: 'key.create', summary: `Created API key "${name}" (${access === 'read' ? 'read only' : 'read and write'})`, entity: 'api_key', entity_ids: [record.id] });
  return {
    status: 201, action: 'keys.create',
    message: `Created API key "${name}". Copy it now: it is shown only this once.`,
    data: { key, id: record.id, name, prefix: record.prefix, access: access === 'read' ? 'read' : 'read_write' },
  };
}

export async function revokeKey(ctx) {
  if (!isUuid(ctx.params.id)) throw new ApiError(404, 'NOT_FOUND', `No API key with id ${ctx.params.id}.`);
  const rec = await revokeApiKey(ctx.sb, ctx.auth.userId, ctx.params.id);
  if (!rec) throw new ApiError(404, 'NOT_FOUND', `No API key with id ${ctx.params.id}.`);
  await recordChange(ctx, { action: 'key.revoke', summary: `Revoked API key "${rec.name}"`, entity: 'api_key', entity_ids: [rec.id] });
  return { status: 200, action: 'keys.revoke', message: `Revoked "${rec.name}". Anything using it stops working immediately (allow up to 30 seconds).`, data: { id: rec.id, name: rec.name, revoked_at: rec.revoked_at } };
}
