// Turns the shared shift rules (src/lib/shiftRules.js) into API errors and warnings with codes,
// plain English messages, hints and details.
import { evaluateShift, getStoreHoursFor, dayNameOf } from '../../src/lib/shiftRules.js';
import { problem } from './http.js';
import { fmt12, dateLabel, round1, shiftOut, timeOffOut } from './format.js';

// shift: { employee_id, date, start_time, end_time, tentative }
// dates: every date the change touches (for the past date check), defaults to [shift.date]
export function checkShift({ shift, employee, shifts, timeOffs, settings, today, ignoreShiftId = null, confirmPast = false, dates = null, empIdx = null }) {
  const ev = evaluateShift({ shift, employee, shifts, timeOffs, settings, today, ignoreShiftId });
  const errors = [];
  const warnings = [];
  const when = `${dateLabel(shift.date)}, ${fmt12(shift.start_time)} to ${fmt12(shift.end_time)}`;

  if (ev.store_hours_violation) {
    const h = ev.store_hours_violation;
    const overnight = h.close <= h.open;
    errors.push(problem('OUTSIDE_STORE_HOURS',
      `The store is open ${fmt12(h.open)} to ${fmt12(h.close)}${overnight ? ' (next day)' : ''} on ${dayNameOf(shift.date)}s, so ${fmt12(shift.start_time)} to ${fmt12(shift.end_time)} does not fit.`,
      {
        hint: `Keep the shift between ${fmt12(h.open)} and ${fmt12(h.close)}. A shift that ends after midnight just uses the later end time (for example "start_time": "18:00", "end_time": "02:00"). Store hours can be changed with PATCH /settings.`,
        details: { store_hours: { open: h.open, close: h.close, closes_next_day: overnight }, requested: { start_time: shift.start_time, end_time: shift.end_time } },
      }));
  }

  if (ev.conflict) {
    const c = ev.conflict;
    errors.push(problem('SHIFT_CONFLICT',
      `${employee.name} already works ${fmt12(c.start_time)} to ${fmt12(c.end_time)} on ${dateLabel(c.date)}, which overlaps ${fmt12(shift.start_time)} to ${fmt12(shift.end_time)}. One person cannot have two overlapping shifts.`,
      {
        hint: `Choose times that end by ${fmt12(c.start_time)} or start at or after ${fmt12(c.end_time)}, change the existing shift with PATCH /shifts/${c.id}, or remove it with DELETE /shifts/${c.id}.`,
        details: { conflicting_shift: shiftOut(c, empIdx) },
      }));
  }

  const touched = dates || [shift.date];
  const pastDate = touched.find((d) => d < today);
  if (pastDate && !confirmPast) {
    errors.push(problem('PAST_DATE_NOT_CONFIRMED',
      `${dateLabel(pastDate)} is in the past (today is ${dateLabel(today)} in Champaign). The website asks "Are you sure?" before changing past days, so the API needs the same confirmation.`,
      { hint: 'If this change to a past day is intended, send it again with "confirm_past": true.', field: 'confirm_past' }));
  }

  if (!getStoreHoursFor(settings, shift.date)) {
    warnings.push(problem('NO_STORE_HOURS', `No store hours are set for ${dayNameOf(shift.date)}s, so the hours check was skipped.`,
      { hint: 'Set hours with PATCH /settings if that day should be checked.' }));
  }

  if (ev.unavailable) {
    const b = ev.unavailable;
    warnings.push(problem('EMPLOYEE_UNAVAILABLE',
      `${employee.name} is marked unavailable ${fmt12(b.start_time)} to ${fmt12(b.end_time)} on ${b.day}s, which overlaps this shift.`,
      { hint: 'This does not block the shift (the website only warns too). Double check with the employee.', details: { unavailable_block: b } }));
  }

  if (ev.time_off.length) {
    const t = ev.time_off[0];
    const out = timeOffOut(t, empIdx);
    warnings.push(problem('TIME_OFF_THAT_DAY',
      `${employee.name} has ${out.type_label.toLowerCase()} on ${dateLabel(shift.date)} (${out.full_day ? 'all day' : `${fmt12(out.start_time)} to ${fmt12(out.end_time)}`})${out.reason ? `: ${out.reason}` : ''}.`,
      { hint: 'This does not block the shift. Remove the time off with DELETE /time-off/{id} if it no longer applies.', details: { time_off: ev.time_off.map((x) => timeOffOut(x, empIdx)) } }));
  }

  const after = round1(ev.weekly_hours_after);
  if (ev.hours_status.code === 'over_max') {
    warnings.push(problem('OVER_MAX_HOURS',
      `With this shift ${employee.name} would have ${after} hours that week, over their max of ${employee.max_hours} (${ev.hours_status.label}).`,
      { hint: 'This does not block the shift. Consider a tentative (backup) shift, which does not count toward hours.', details: { weekly_hours: after, max_hours: employee.max_hours } }));
  } else if (ev.hours_status.code === 'at_max') {
    warnings.push(problem('AT_MAX_HOURS', `${employee.name} reaches their max of ${employee.max_hours} hours that week with this shift.`,
      { details: { weekly_hours: after, max_hours: employee.max_hours } }));
  }

  return {
    errors,
    warnings,
    evaluation: {
      shift: { ...shift, label: `${employee.name}: ${when}` },
      blocked: errors.length > 0,
      shift_hours: round1(ev.shift_hours),
      weekly_hours_before: round1(ev.weekly_hours_before),
      weekly_hours_after: after,
      hours_status: ev.hours_status.code,
      hours_status_label: ev.hours_status.label,
      store_hours: ev.store_hours,
    },
  };
}

// HTTP status for a set of rule errors.
export function statusForErrors(errors) {
  if (errors.some((e) => e.code === 'SHIFT_CONFLICT' || e.code === 'PAST_DATE_NOT_CONFIRMED')) return 409;
  return 422;
}
