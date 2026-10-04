// Shapes database rows into the API's output: stable machine fields plus human labels.
import {
  DAY_KEYS, DAY_NAMES, dayIndexOf, addDays, shiftHours, crossesMidnight, getStoreHoursFor,
  weekStartOf, hoursStatus,
} from '../../src/lib/shiftRules.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmt12(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function dateLabel(d) {
  if (!d) return null;
  const [y, mo, day] = d.split('-').map(Number);
  return `${DAY_NAMES[dayIndexOf(d)].slice(0, 3)}, ${MONTHS[mo - 1]} ${day} ${y}`;
}

export function round1(n) {
  return Math.round(n * 100) / 100;
}

export function storeHoursOut(settings, date) {
  const h = getStoreHoursFor(settings, date);
  if (!h) return null;
  return {
    open: h.open,
    close: h.close,
    closes_next_day: h.closes_next_day,
    label: `${fmt12(h.open)} to ${fmt12(h.close)}${h.closes_next_day ? ' (next day)' : ''}`,
  };
}

export function employeeIndex(employees) {
  const m = new Map();
  for (const e of employees) m.set(e.id, e);
  return m;
}

// Employees in the same order the website shows them: saved custom order first, then the rest by
// when they were added.
export function orderEmployees(employees, settings) {
  const order = Array.isArray(settings?.employee_order) ? settings.employee_order : [];
  const pos = new Map(order.map((id, i) => [id, i]));
  return [...employees].sort((a, b) => {
    const pa = pos.has(a.id) ? pos.get(a.id) : 9999;
    const pb = pos.has(b.id) ? pos.get(b.id) : 9999;
    if (pa !== pb) return pa - pb;
    return String(a.created_at).localeCompare(String(b.created_at));
  });
}

export function shiftOut(s, empIdx) {
  const emp = empIdx ? empIdx.get(s.employee_id) : null;
  const overnight = crossesMidnight(s.start_time, s.end_time);
  const hours = round1(shiftHours(s.start_time, s.end_time));
  const name = emp?.name || s.employee_name || 'Unknown employee';
  return {
    id: s.id,
    employee_id: s.employee_id,
    employee_name: name,
    employee_title: emp?.title ?? null,
    date: s.date,
    weekday: DAY_NAMES[dayIndexOf(s.date)],
    start_time: s.start_time,
    end_time: s.end_time,
    ends_next_day: overnight,
    end_date: overnight ? addDays(s.date, 1) : s.date,
    hours,
    tentative: !!s.tentative,
    counts_toward_hours: !s.tentative,
    color: s.color || emp?.color || null,
    label: `${name}: ${dateLabel(s.date)}, ${fmt12(s.start_time)} to ${fmt12(s.end_time)}${overnight ? ' (next day)' : ''}, ${hours}h${s.tentative ? ', tentative (backup, not counted)' : ''}`,
  };
}

const TIME_OFF_LABELS = { regular_off: 'Regular day off', custom_time_off: 'Time off request' };

export function timeOffOut(t, empIdx) {
  const emp = empIdx ? empIdx.get(t.employee_id) : null;
  const date = t.start_date || t.date;
  const name = emp?.name || t.employee_name || 'Unknown employee';
  const typeLabel = TIME_OFF_LABELS[t.type] || t.type;
  const when = t.full_day !== false ? 'all day' : `${fmt12(t.start_time)} to ${fmt12(t.end_time)}`;
  return {
    id: t.id,
    employee_id: t.employee_id,
    employee_name: name,
    date,
    weekday: date ? DAY_NAMES[dayIndexOf(date)] : null,
    type: t.type,
    type_label: typeLabel,
    full_day: t.full_day !== false,
    start_time: t.start_time || null,
    end_time: t.end_time || null,
    reason: t.reason || '',
    label: `${name}: ${typeLabel}, ${dateLabel(date)}, ${when}${t.reason ? ` (${t.reason})` : ''}`,
  };
}

export function eventOut(e) {
  const end = e.end_date || e.start_date;
  const when = e.all_day !== false ? 'all day' : `${fmt12(e.start_time)} to ${fmt12(e.end_time)}`;
  return {
    id: e.id,
    name: e.name,
    start_date: e.start_date,
    end_date: end,
    all_day: e.all_day !== false,
    start_time: e.start_time || null,
    end_time: e.end_time || null,
    notes: e.notes || '',
    color: e.color || null,
    label: `${e.name}: ${dateLabel(e.start_date)}${end !== e.start_date ? ` to ${dateLabel(end)}` : ''}, ${when}`,
  };
}

export function employeeOut(e, displayOrder = null) {
  return {
    id: e.id,
    name: e.name,
    title: e.title || '',
    color: e.color || null,
    min_hours: e.min_hours ?? null,
    max_hours: e.max_hours ?? null,
    available_hours: e.available_hours || '',
    unavailable_hours: Array.isArray(e.unavailable_hours) ? e.unavailable_hours : [],
    food_safety_certified: !!e.food_safety_certified,
    notes: e.notes || '',
    display_order: displayOrder,
    created_at: e.created_at,
  };
}

export function settingsOut(s) {
  if (!s) return null;
  const hours = {};
  for (const day of [...DAY_KEYS.slice(1), DAY_KEYS[0]]) {
    const open = s[`${day}_open`] || null;
    const close = s[`${day}_close`] || null;
    hours[day] = open && close
      ? { open, close, closes_next_day: close <= open, label: `${fmt12(open)} to ${fmt12(close)}${close <= open ? ' (next day)' : ''}` }
      : null;
  }
  const notes = s.metadata?.week_notes || {};
  return {
    store_name: s.store_name || '',
    manager_name: s.manager_name || '',
    notes: s.notes || '',
    hours,
    employee_order: Array.isArray(s.employee_order) ? s.employee_order : [],
    week_notes_count: Object.keys(notes).length,
  };
}

// One employee's week: their shifts and counted hours, Monday to Sunday.
export function employeeWeek(employee, shifts, anyDateInWeek, empIdx) {
  const wk = weekStartOf(anyDateInWeek);
  const end = addDays(wk, 6);
  const mine = shifts
    .filter((s) => s.employee_id === employee.id && s.date >= wk && s.date <= end)
    .sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time));
  const counted = mine.filter((s) => !s.tentative).reduce((n, s) => n + shiftHours(s.start_time, s.end_time), 0);
  const tentative = mine.filter((s) => s.tentative).reduce((n, s) => n + shiftHours(s.start_time, s.end_time), 0);
  const status = hoursStatus(employee, counted);
  return {
    employee_id: employee.id,
    employee_name: employee.name,
    week_start: wk,
    week_end: end,
    hours: round1(counted),
    tentative_hours: round1(tentative),
    shift_count: mine.length,
    min_hours: employee.min_hours ?? null,
    max_hours: employee.max_hours ?? null,
    hours_status: status.code,
    hours_status_label: status.label,
    shifts: mine.map((s) => shiftOut(s, empIdx)),
  };
}

// Everyone working on one date, in start time order.
export function dayView(date, shifts, timeOffs, settings, empIdx) {
  const dayShifts = shifts
    .filter((s) => s.date === date)
    .sort((a, b) => a.start_time.localeCompare(b.start_time) || String(a.employee_name).localeCompare(String(b.employee_name)));
  const dayOff = (timeOffs || []).filter((t) => (t.start_date || t.date) === date);
  const counted = dayShifts.filter((s) => !s.tentative).reduce((n, s) => n + shiftHours(s.start_time, s.end_time), 0);
  return {
    date,
    weekday: DAY_NAMES[dayIndexOf(date)],
    label: dateLabel(date),
    store_hours: storeHoursOut(settings, date),
    shift_count: dayShifts.length,
    people_working: new Set(dayShifts.map((s) => s.employee_id)).size,
    hours: round1(counted),
    shifts: dayShifts.map((s) => shiftOut(s, empIdx)),
    time_off: dayOff.map((t) => timeOffOut(t, empIdx)),
  };
}
