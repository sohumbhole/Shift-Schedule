// Shift write endpoints for /api/v1: create, batch create, update, delete, clear, copy week, copy day.
import { ApiError, problem } from './http.js';
import { resolveEmployee, resolveEmployees, parseDate, parseTime, parseBool, resolveRange } from './parse.js';
import { shiftOut, timeOffOut, dateLabel, round1 } from './format.js';
import { checkShift, statusForErrors } from './rules.js';
import { base, LIMITS, plural, afterContext, unknownFieldWarnings, failureMessage } from './common.js';
import { recordChange, stripRow } from './change.js';
import {
  weekStartOf, addDays, daysBetween, findShiftConflict, checkStoreHours, getStoreHoursFor,
} from '../../src/lib/shiftRules.js';

const SHIFT_FIELDS = ['employee', 'employee_id', 'employee_name', 'date', 'start_time', 'end_time', 'start', 'end', 'tentative', 'confirm_past', 'dry_run'];

function rangeOfWeeks(dates) {
  const sorted = [...new Set(dates)].sort();
  return { start: weekStartOf(sorted[0]), end: addDays(weekStartOf(sorted[sorted.length - 1]), 6) };
}

function parseShiftInput(b, employees, today, prefix = '') {
  const emp = resolveEmployee(b.employee ?? b.employee_id ?? b.employee_name, employees, `${prefix}employee`);
  return {
    emp,
    shift: {
      employee_id: emp.id,
      date: parseDate(b.date, `${prefix}date`, today),
      start_time: parseTime(b.start_time ?? b.start, `${prefix}start_time`),
      end_time: parseTime(b.end_time ?? b.end, `${prefix}end_time`),
      tentative: parseBool(b.tentative, `${prefix}tentative`, false),
    },
  };
}

function rowFor(shift, emp) {
  return {
    employee_id: emp.id,
    employee_name: emp.name,
    date: shift.date,
    start_time: shift.start_time,
    end_time: shift.end_time,
    color: emp.color || '#FF8C00',
    tentative: !!shift.tentative,
  };
}

// ---------------- POST /shifts ----------------
export async function createShift(ctx) {
  const b = ctx.body;
  const warnings = unknownFieldWarnings(b, SHIFT_FIELDS);
  const { settings, employees, empIdx } = await base(ctx);
  const { emp, shift } = parseShiftInput(b, employees, ctx.today);
  const confirmPast = parseBool(b.confirm_past ?? ctx.query.confirm_past, 'confirm_past', false);
  const wk = weekStartOf(shift.date);
  const [weekShifts, dayOff] = await Promise.all([
    ctx.db.shifts({ start: wk, end: addDays(wk, 6) }),
    ctx.db.timeOff({ start: shift.date, end: shift.date }),
  ]);
  const check = checkShift({ shift, employee: emp, shifts: weekShifts, timeOffs: dayOff, settings, today: ctx.today, confirmPast, empIdx });
  warnings.push(...check.warnings);

  if (check.errors.length) {
    const context = await afterContext(ctx, { dates: [shift.date], employeeIds: [emp.id], shifts: weekShifts, timeOffs: dayOff });
    return {
      status: statusForErrors(check.errors),
      action: 'shift.create',
      message: failureMessage('Shift not added', check.errors),
      data: { proposed: check.evaluation, day: context.days[0], employee_week: context.employee_weeks[0] },
      errors: check.errors,
      warnings,
    };
  }

  const row = rowFor(shift, emp);
  if (ctx.dryRun) {
    const wouldBe = [...weekShifts, { ...row, id: '(new)' }];
    const context = await afterContext(ctx, { dates: [shift.date], employeeIds: [emp.id], shifts: wouldBe, timeOffs: dayOff });
    return {
      status: 200,
      action: 'shift.create',
      message: `Dry run: this shift can be added (nothing was saved). ${shiftOut(row, empIdx).label}. ${emp.name} would have ${check.evaluation.weekly_hours_after} counted hours that week.`,
      data: { would_create: shiftOut({ ...row, id: null }, empIdx), proposed: check.evaluation, day: context.days[0], employee_week: context.employee_weeks[0] },
      warnings,
    };
  }

  const [created] = await ctx.db.insert('shifts', [row]);
  const out = shiftOut(created, empIdx);
  const change = await recordChange(ctx, {
    action: 'shift.create', summary: `Added ${out.label}`, entity: 'shift', entity_ids: [created.id],
    after: out, inverse: [{ op: 'delete', table: 'shifts', ids: [created.id], expect: [created] }],
  });
  const context = await afterContext(ctx, { dates: [created.date], employeeIds: [emp.id] });
  const wkOut = context.employee_weeks[0];
  return {
    status: 201,
    action: 'shift.create',
    message: `Added ${out.label}. ${emp.name} now has ${wkOut.hours} counted hours that week${emp.max_hours ? ` (max ${emp.max_hours})` : ''}.`,
    data: { shift: out, day: context.days[0], employee_week: wkOut, change },
    warnings,
  };
}

// ---------------- POST /shifts/batch ----------------
export async function batchCreateShifts(ctx) {
  const b = ctx.body;
  const warnings = unknownFieldWarnings(b, ['shifts', 'atomic', 'confirm_past', 'dry_run']);
  if (!Array.isArray(b.shifts) || b.shifts.length === 0) {
    throw new ApiError(400, 'MISSING_FIELD', '"shifts" must be a non empty array of shifts.', {
      field: 'shifts', hint: 'Example: {"shifts": [{"employee": "Arpit", "date": "2026-10-10", "start_time": "17:00", "end_time": "23:00"}]}',
    });
  }
  if (b.shifts.length > LIMITS.batch_max_shifts) {
    throw new ApiError(400, 'BATCH_TOO_LARGE', `A batch can hold up to ${LIMITS.batch_max_shifts} shifts; got ${b.shifts.length}.`, { hint: 'Split it into several batches.' });
  }
  const atomic = parseBool(b.atomic, 'atomic', true);
  const confirmPast = parseBool(b.confirm_past, 'confirm_past', false);
  const { settings, employees, empIdx } = await base(ctx);

  // Parse everything first; a bad item becomes an item error, not a crash.
  const parsed = b.shifts.map((item, index) => {
    try {
      return { index, ...parseShiftInput(item || {}, employees, ctx.today, `shifts[${index}].`), confirmPast: parseBool(item?.confirm_past, `shifts[${index}].confirm_past`, confirmPast) };
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      return { index, parseError: problem(e.code, e.message, e.extra) };
    }
  });
  const dates = parsed.filter((p) => p.shift).map((p) => p.shift.date);
  const span = dates.length ? rangeOfWeeks(dates) : null;
  const existing = span ? await ctx.db.shifts(span) : [];
  const offs = span ? await ctx.db.timeOff({ start: span.start, end: span.end }) : [];

  // Check each shift against the schedule AND the earlier shifts in this batch.
  const working = [...existing];
  const results = [];
  const accepted = [];
  for (const p of parsed) {
    if (p.parseError) {
      results.push({ index: p.index, ok: false, errors: [p.parseError], warnings: [] });
      continue;
    }
    const check = checkShift({ shift: p.shift, employee: p.emp, shifts: working, timeOffs: offs, settings, today: ctx.today, confirmPast: p.confirmPast, empIdx });
    if (check.errors.length) {
      results.push({ index: p.index, ok: false, proposed: check.evaluation, errors: check.errors, warnings: check.warnings });
      continue;
    }
    const row = rowFor(p.shift, p.emp);
    working.push({ ...row, id: `(batch item ${p.index})` });
    accepted.push({ index: p.index, row, emp: p.emp });
    results.push({ index: p.index, ok: true, proposed: check.evaluation, errors: [], warnings: check.warnings });
  }
  const failed = results.filter((r) => !r.ok);
  const touchedDates = accepted.map((a) => a.row.date);
  const touchedEmps = accepted.map((a) => a.emp.id);

  if (failed.length && (atomic || accepted.length === 0)) {
    return {
      status: failed.some((f) => f.errors.some((e) => e.code === 'SHIFT_CONFLICT' || e.code === 'PAST_DATE_NOT_CONFIRMED')) ? 409 : 422,
      action: 'shifts.batch_create',
      message: `No shifts were added: ${failed.length} of ${b.shifts.length} have problems${atomic ? ' and the batch is all or nothing ("atomic": true)' : ''}. First problem (item ${failed[0].index}): ${failed[0].errors[0].message}`,
      data: { results },
      errors: failed.map((f) => ({ ...f.errors[0], details: { ...(f.errors[0].details || {}), index: f.index } })),
      warnings,
    };
  }

  if (ctx.dryRun) {
    const context = await afterContext(ctx, { dates: touchedDates, employeeIds: touchedEmps, shifts: working, timeOffs: offs });
    return {
      status: 200,
      action: 'shifts.batch_create',
      message: `Dry run: ${plural(accepted.length, 'shift')} can be added${failed.length ? `, ${failed.length} cannot (see data.results)` : ''}. Nothing was saved.`,
      data: { would_create: accepted.map((a) => shiftOut({ ...a.row, id: null }, empIdx)), results, ...context },
      warnings,
    };
  }

  const created = await ctx.db.insert('shifts', accepted.map((a) => a.row));
  const createdOut = created.map((s) => shiftOut(s, empIdx));
  const change = await recordChange(ctx, {
    action: 'shifts.batch_create',
    summary: `Added ${plural(created.length, 'shift')} in one batch`,
    entity: 'shift', entity_ids: created.map((s) => s.id),
    after: createdOut, inverse: [{ op: 'delete', table: 'shifts', ids: created.map((s) => s.id), expect: created }],
  });
  const context = await afterContext(ctx, { dates: touchedDates, employeeIds: touchedEmps });
  if (failed.length) {
    warnings.push(problem('SOME_SHIFTS_SKIPPED', `${plural(failed.length, 'shift')} had problems and were skipped ("atomic": false). See data.results.`, { details: { skipped_indexes: failed.map((f) => f.index) } }));
  }
  return {
    status: failed.length ? 207 : 201,
    action: 'shifts.batch_create',
    message: `Added ${plural(created.length, 'shift')}${failed.length ? `; skipped ${failed.length} with problems` : ''}.`,
    data: { created: createdOut, results, ...context, change },
    warnings,
  };
}

// ---------------- PATCH /shifts/{id} ----------------
export async function updateShift(ctx) {
  const b = ctx.body;
  const warnings = unknownFieldWarnings(b, SHIFT_FIELDS);
  const existing = await ctx.db.getById('shifts', ctx.params.id);
  if (!existing) throw new ApiError(404, 'NOT_FOUND', `No shift with id ${ctx.params.id}.`, { hint: 'GET /shifts or GET /schedule lists shifts with their ids.' });
  const { settings, employees, empIdx } = await base(ctx);
  const confirmPast = parseBool(b.confirm_past ?? ctx.query.confirm_past, 'confirm_past', false);

  const empInput = b.employee ?? b.employee_id ?? b.employee_name;
  const emp = empInput !== undefined ? resolveEmployee(empInput, employees) : (empIdx.get(existing.employee_id) || { id: existing.employee_id, name: existing.employee_name, color: existing.color });
  const next = {
    employee_id: emp.id,
    date: b.date !== undefined ? parseDate(b.date, 'date', ctx.today) : existing.date,
    start_time: (b.start_time ?? b.start) !== undefined ? parseTime(b.start_time ?? b.start, 'start_time') : existing.start_time,
    end_time: (b.end_time ?? b.end) !== undefined ? parseTime(b.end_time ?? b.end, 'end_time') : existing.end_time,
    tentative: b.tentative !== undefined ? parseBool(b.tentative, 'tentative') : !!existing.tentative,
  };
  const before = shiftOut(existing, empIdx);
  const same = next.employee_id === existing.employee_id && next.date === existing.date
    && next.start_time === existing.start_time && next.end_time === existing.end_time && next.tentative === !!existing.tentative;
  if (same) {
    return {
      status: 200, action: 'shift.update',
      message: `Nothing to change: the shift already is ${before.label}. Send at least one of employee, date, start_time, end_time, tentative with a new value.`,
      data: { shift: before }, warnings,
    };
  }

  const span = rangeOfWeeks([existing.date, next.date]);
  const [shifts, offs] = await Promise.all([ctx.db.shifts(span), ctx.db.timeOff({ start: next.date, end: next.date })]);
  const check = checkShift({
    shift: next, employee: emp, shifts, timeOffs: offs, settings, today: ctx.today, ignoreShiftId: existing.id,
    confirmPast, dates: [...new Set([existing.date, next.date])], empIdx,
  });
  warnings.push(...check.warnings);
  const dates = [...new Set([existing.date, next.date])];
  const empIds = [...new Set([existing.employee_id, emp.id])];

  if (check.errors.length) {
    const context = await afterContext(ctx, { dates, employeeIds: empIds, shifts, timeOffs: offs });
    return {
      status: statusForErrors(check.errors), action: 'shift.update',
      message: failureMessage('Shift not changed', check.errors),
      data: { current: before, proposed: check.evaluation, ...context },
      errors: check.errors, warnings,
    };
  }

  const set = {
    employee_id: emp.id,
    employee_name: emp.name,
    date: next.date,
    start_time: next.start_time,
    end_time: next.end_time,
    tentative: next.tentative,
    color: emp.id !== existing.employee_id ? (emp.color || '#FF8C00') : existing.color,
  };
  if (ctx.dryRun) {
    const wouldBe = shifts.map((s) => (s.id === existing.id ? { ...s, ...set } : s));
    const context = await afterContext(ctx, { dates, employeeIds: empIds, shifts: wouldBe, timeOffs: offs });
    return {
      status: 200, action: 'shift.update',
      message: `Dry run: the change is allowed (nothing was saved). Was: ${before.label}. Would be: ${shiftOut({ ...existing, ...set }, empIdx).label}.`,
      data: { current: before, would_become: shiftOut({ ...existing, ...set }, empIdx), proposed: check.evaluation, ...context },
      warnings,
    };
  }

  const updated = await ctx.db.update('shifts', existing.id, set);
  const after = shiftOut(updated, empIdx);
  const prior = Object.fromEntries(Object.keys(set).map((k) => [k, existing[k]]));
  const change = await recordChange(ctx, {
    action: 'shift.update', summary: `Changed shift from "${before.label}" to "${after.label}"`, entity: 'shift', entity_ids: [existing.id],
    before, after, inverse: [{ op: 'update', table: 'shifts', id: existing.id, set: prior, expect: Object.fromEntries(Object.keys(set).map((k) => [k, updated[k]])) }],
  });
  const context = await afterContext(ctx, { dates, employeeIds: empIds });
  return {
    status: 200, action: 'shift.update',
    message: `Updated. Was: ${before.label}. Now: ${after.label}.`,
    data: { shift: after, before, ...context, change },
    warnings,
  };
}

// ---------------- DELETE /shifts/{id} ----------------
export async function deleteShift(ctx) {
  const existing = await ctx.db.getById('shifts', ctx.params.id);
  if (!existing) throw new ApiError(404, 'NOT_FOUND', `No shift with id ${ctx.params.id}.`, { hint: 'It may already be deleted. GET /shifts lists current shifts.' });
  const { empIdx } = await base(ctx);
  const confirmPast = parseBool(ctx.body?.confirm_past ?? ctx.query.confirm_past, 'confirm_past', false);
  const out = shiftOut(existing, empIdx);
  if (existing.date < ctx.today && !confirmPast) {
    return {
      status: 409, action: 'shift.delete',
      message: `Shift not deleted: ${dateLabel(existing.date)} is in the past. Send again with confirm_past=true if intended.`,
      data: { shift: out },
      errors: [problem('PAST_DATE_NOT_CONFIRMED', `${dateLabel(existing.date)} is in the past (today is ${dateLabel(ctx.today)}).`, { hint: 'Add ?confirm_past=true (or "confirm_past": true in the body).', field: 'confirm_past' })],
    };
  }
  if (ctx.dryRun) {
    return { status: 200, action: 'shift.delete', message: `Dry run: would delete ${out.label}. Nothing was changed.`, data: { would_delete: out } };
  }
  await ctx.db.remove('shifts', [existing.id]);
  const change = await recordChange(ctx, {
    action: 'shift.delete', summary: `Deleted ${out.label}`, entity: 'shift', entity_ids: [existing.id],
    before: out, inverse: [{ op: 'insert', table: 'shifts', rows: [stripRow(existing)] }],
  });
  const context = await afterContext(ctx, { dates: [existing.date], employeeIds: [existing.employee_id] });
  return {
    status: 200, action: 'shift.delete',
    message: `Deleted ${out.label}.${context.employee_weeks[0] ? ` ${out.employee_name} now has ${context.employee_weeks[0].hours} counted hours that week.` : ''}`,
    data: { deleted: out, day: context.days[0], employee_week: context.employee_weeks[0] || null, change },
  };
}

// ---------------- POST /shifts/clear ----------------
export async function clearShifts(ctx) {
  const b = { ...ctx.query, ...ctx.body };
  const warnings = unknownFieldWarnings(ctx.body, ['date', 'week', 'start', 'end', 'preset', 'employee', 'include_regular_off', 'confirm', 'confirm_past', 'dry_run']);
  if (!b.date && !b.week && !b.start && !b.end && !b.preset) {
    throw new ApiError(400, 'MISSING_FIELD', 'Say what to clear: "date" (one day), "week" (any date in that week), or "start" and "end".', { hint: 'Example: {"date": "2026-10-10", "confirm": true}' });
  }
  const range = resolveRange(b, ctx.today);
  const days = daysBetween(range.start, range.end) + 1;
  if (days > LIMITS.clear_max_days) {
    throw new ApiError(400, 'RANGE_TOO_LARGE', `Clear works on up to ${LIMITS.clear_max_days} days at a time; that range is ${days} days.`, { hint: 'Clear one week at a time.' });
  }
  const { employees, empIdx } = await base(ctx);
  const filtered = b.employee ? resolveEmployees(b.employee, employees) : null;
  const ids = filtered ? filtered.map((e) => e.id) : null;
  const includeOff = parseBool(b.include_regular_off, 'include_regular_off', true);
  const confirm = parseBool(b.confirm, 'confirm', false);
  const confirmPast = parseBool(b.confirm_past, 'confirm_past', false);

  const shifts = await ctx.db.shifts({ start: range.start, end: range.end, employeeIds: ids });
  const offs = includeOff ? await ctx.db.timeOff({ start: range.start, end: range.end, employeeIds: ids, type: 'regular_off' }) : [];
  const span = range.start === range.end ? dateLabel(range.start) : `${dateLabel(range.start)} to ${dateLabel(range.end)}`;
  const preview = { shifts: shifts.map((s) => shiftOut(s, empIdx)), regular_days_off: offs.map((t) => timeOffOut(t, empIdx)) };

  if (!shifts.length && !offs.length) {
    return { status: 200, action: 'shifts.clear', message: `Nothing to clear for ${span}${filtered ? ` (${filtered.map((e) => e.name).join(', ')})` : ''}.`, data: { cleared: preview }, warnings };
  }
  const pastTouched = [...shifts.map((s) => s.date), ...offs.map((t) => t.start_date)].some((d) => d < ctx.today);
  const errors = [];
  if (!confirm && !ctx.dryRun) errors.push(problem('CONFIRM_REQUIRED', `This removes ${plural(shifts.length, 'shift')}${offs.length ? ` and ${plural(offs.length, 'regular day off', 'regular days off')}` : ''} for ${span}. The website asks for confirmation first, so the API needs "confirm": true.`, { field: 'confirm', hint: 'Send again with "confirm": true, or with "dry_run": true to preview.' }));
  if (pastTouched && !confirmPast) errors.push(problem('PAST_DATE_NOT_CONFIRMED', `Part of ${span} is in the past (today is ${dateLabel(ctx.today)}).`, { field: 'confirm_past', hint: 'Add "confirm_past": true if intended.' }));
  if (errors.length) {
    return { status: 409, action: 'shifts.clear', message: failureMessage('Nothing was cleared', errors), data: { would_clear: preview }, errors, warnings };
  }
  if (ctx.dryRun) {
    return { status: 200, action: 'shifts.clear', message: `Dry run: would clear ${plural(shifts.length, 'shift')} and ${plural(offs.length, 'regular day off', 'regular days off')} for ${span}. Nothing was changed.`, data: { would_clear: preview }, warnings };
  }

  await ctx.db.remove('shifts', shifts.map((s) => s.id));
  await ctx.db.remove('time_off', offs.map((t) => t.id));
  const change = await recordChange(ctx, {
    action: 'shifts.clear', summary: `Cleared ${plural(shifts.length, 'shift')}${offs.length ? ` and ${plural(offs.length, 'regular day off', 'regular days off')}` : ''} for ${span}`,
    entity: 'shift', entity_ids: shifts.map((s) => s.id), before: preview,
    inverse: [
      ...(shifts.length ? [{ op: 'insert', table: 'shifts', rows: shifts.map(stripRow) }] : []),
      ...(offs.length ? [{ op: 'insert', table: 'time_off', rows: offs.map(stripRow) }] : []),
    ],
  });
  return {
    status: 200, action: 'shifts.clear',
    message: `Cleared ${plural(shifts.length, 'shift')}${offs.length ? ` and ${plural(offs.length, 'regular day off', 'regular days off')}` : ''} for ${span}. Undo with POST /changes/${change?.change_id}/undo.`,
    data: { cleared: preview, change },
    warnings,
  };
}

// ---------------- POST /schedule/copy-week and /schedule/copy-day ----------------
async function copySchedule(ctx, { fromStart, toStart, days, replace, includeOff, ids, label }) {
  const { settings, empIdx } = await base(ctx);
  const offset = daysBetween(fromStart, toStart);
  const fromEnd = addDays(fromStart, days - 1);
  const toEnd = addDays(toStart, days - 1);
  const [srcShifts, dstShifts, srcOff, dstOff] = await Promise.all([
    ctx.db.shifts({ start: fromStart, end: fromEnd, employeeIds: ids }),
    ctx.db.shifts({ start: toStart, end: toEnd, employeeIds: ids }),
    includeOff ? ctx.db.timeOff({ start: fromStart, end: fromEnd, employeeIds: ids, type: 'regular_off' }) : [],
    includeOff ? ctx.db.timeOff({ start: toStart, end: toEnd, employeeIds: ids, type: 'regular_off' }) : [],
  ]);
  const warnings = [];
  const removeShifts = replace ? dstShifts : [];
  const removeOff = replace ? dstOff : [];
  const keep = replace ? [] : dstShifts;

  const newShifts = [];
  for (const s of srcShifts) {
    const emp = empIdx.get(s.employee_id);
    const date = addDays(s.date, offset);
    if (!replace && findShiftConflict(s.employee_id, date, s.start_time, s.end_time, [...keep, ...newShifts])) {
      warnings.push(problem('SKIPPED_CONFLICT', `Skipped ${shiftOut({ ...s, date }, empIdx).label}: it overlaps a shift already there ("replace": false).`));
      continue;
    }
    if (checkStoreHours(getStoreHoursFor(settings, date), s.start_time, s.end_time)) {
      warnings.push(problem('COPIED_SHIFT_OUTSIDE_STORE_HOURS', `Copied ${shiftOut({ ...s, date }, empIdx).label}, which is outside current store hours for that day (the website's copy does not block this either).`));
    }
    newShifts.push({
      employee_id: s.employee_id, employee_name: emp?.name || s.employee_name, date,
      start_time: s.start_time, end_time: s.end_time, color: s.color, tentative: !!s.tentative,
    });
  }
  const newOff = srcOff
    .filter((t) => replace || !dstOff.some((d) => d.employee_id === t.employee_id && d.start_date === addDays(t.start_date, offset)))
    .map((t) => ({ ...stripRow(t), start_date: addDays(t.start_date, offset), employee_name: empIdx.get(t.employee_id)?.name || t.employee_name }));

  const summaryLine = `${label}: copy ${plural(newShifts.length, 'shift')}${includeOff ? ` and ${plural(newOff.length, 'regular day off', 'regular days off')}` : ''} from ${dateLabel(fromStart)}${days > 1 ? ` to ${dateLabel(fromEnd)}` : ''} onto ${dateLabel(toStart)}${days > 1 ? ` to ${dateLabel(toEnd)}` : ''}${replace ? `, replacing ${plural(removeShifts.length, 'shift')}${includeOff ? ` and ${plural(removeOff.length, 'regular day off', 'regular days off')}` : ''} already there` : ', keeping what is already there'}`;
  const targetDates = [];
  for (let d = toStart; d <= toEnd; d = addDays(d, 1)) targetDates.push(d);
  if (toStart < ctx.today) warnings.push(problem('PAST_DATES_IN_TARGET', `Part of the target range is in the past (today is ${dateLabel(ctx.today)}).`));

  if (ctx.dryRun) {
    const wouldBe = [...keep, ...newShifts.map((s, i) => ({ ...s, id: `(new ${i})` }))];
    return {
      status: 200,
      message: `Dry run: would ${summaryLine.charAt(0).toLowerCase()}${summaryLine.slice(1)}. Nothing was changed.`,
      data: { would_create: newShifts.map((s) => shiftOut({ ...s, id: null }, empIdx)), would_remove: removeShifts.map((s) => shiftOut(s, empIdx)), days: targetDates.map((d) => ({ date: d, shifts: wouldBe.filter((s) => s.date === d).map((s) => shiftOut(s, empIdx)) })) },
      warnings,
    };
  }

  // Insert the new rows first, then remove the old ones, so a failure can never leave the target empty.
  const createdShifts = await ctx.db.insert('shifts', newShifts);
  const createdOff = await ctx.db.insert('time_off', newOff);
  await ctx.db.remove('shifts', removeShifts.map((s) => s.id));
  await ctx.db.remove('time_off', removeOff.map((t) => t.id));
  const change = await recordChange(ctx, {
    action: label === 'Copy week' ? 'schedule.copy_week' : 'schedule.copy_day',
    summary: summaryLine,
    entity: 'shift', entity_ids: createdShifts.map((s) => s.id),
    before: { replaced_shifts: removeShifts.map((s) => shiftOut(s, empIdx)) },
    after: { created_shifts: createdShifts.map((s) => shiftOut(s, empIdx)) },
    inverse: [
      ...(createdShifts.length ? [{ op: 'delete', table: 'shifts', ids: createdShifts.map((s) => s.id), expect: createdShifts }] : []),
      ...(createdOff.length ? [{ op: 'delete', table: 'time_off', ids: createdOff.map((t) => t.id), expect: createdOff }] : []),
      ...(removeShifts.length ? [{ op: 'insert', table: 'shifts', rows: removeShifts.map(stripRow) }] : []),
      ...(removeOff.length ? [{ op: 'insert', table: 'time_off', rows: removeOff.map(stripRow) }] : []),
    ],
  });
  const context = await afterContext(ctx, { dates: targetDates, employeeIds: [] });
  return {
    status: 201,
    message: `Done. ${summaryLine}.`,
    data: { created_shifts: createdShifts.map((s) => shiftOut(s, empIdx)), created_regular_days_off: createdOff.map((t) => timeOffOut(t, empIdx)), removed_shifts: removeShifts.map((s) => shiftOut(s, empIdx)), days: context.days, change },
    warnings,
  };
}

export async function copyWeek(ctx) {
  const b = { ...ctx.query, ...ctx.body };
  const warnings = unknownFieldWarnings(ctx.body, ['to_week', 'from_week', 'replace', 'include_time_off', 'employee', 'dry_run']);
  if (!b.to_week) throw new ApiError(400, 'MISSING_FIELD', '"to_week" is required: any date in the week to copy INTO.', { field: 'to_week', hint: 'Example: {"to_week": "2026-10-12"} copies the week before it into that week, like the website\'s "Copy previous week".' });
  const toStart = weekStartOf(parseDate(b.to_week, 'to_week', ctx.today));
  const fromStart = b.from_week ? weekStartOf(parseDate(b.from_week, 'from_week', ctx.today)) : addDays(toStart, -7);
  if (fromStart === toStart) throw new ApiError(400, 'INVALID_VALUE', '"from_week" and "to_week" are the same week.', { field: 'from_week' });
  const { employees } = await base(ctx);
  const ids = b.employee ? resolveEmployees(b.employee, employees).map((e) => e.id) : null;
  const r = await copySchedule(ctx, {
    fromStart, toStart, days: 7,
    replace: parseBool(b.replace, 'replace', true),
    includeOff: parseBool(b.include_time_off, 'include_time_off', true),
    ids, label: 'Copy week',
  });
  return { ...r, action: 'schedule.copy_week', warnings: [...warnings, ...r.warnings] };
}

export async function copyDay(ctx) {
  const b = { ...ctx.query, ...ctx.body };
  const warnings = unknownFieldWarnings(ctx.body, ['to_date', 'from_date', 'replace', 'include_time_off', 'employee', 'dry_run']);
  if (!b.to_date) throw new ApiError(400, 'MISSING_FIELD', '"to_date" is required: the day to copy INTO.', { field: 'to_date', hint: 'Example: {"to_date": "2026-10-10"} copies the day before it, like the website\'s "Copy previous day".' });
  const toStart = parseDate(b.to_date, 'to_date', ctx.today);
  const fromStart = b.from_date ? parseDate(b.from_date, 'from_date', ctx.today) : addDays(toStart, -1);
  if (fromStart === toStart) throw new ApiError(400, 'INVALID_VALUE', '"from_date" and "to_date" are the same day.', { field: 'from_date' });
  const { employees } = await base(ctx);
  const ids = b.employee ? resolveEmployees(b.employee, employees).map((e) => e.id) : null;
  const r = await copySchedule(ctx, {
    fromStart, toStart, days: 1,
    replace: parseBool(b.replace, 'replace', true),
    includeOff: parseBool(b.include_time_off, 'include_time_off', false),
    ids, label: 'Copy day',
  });
  return { ...r, action: 'schedule.copy_day', warnings: [...warnings, ...r.warnings] };
}

export { round1 };
