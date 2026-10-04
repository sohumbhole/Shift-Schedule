// Shift rules shared by the website (AddShiftModal) and the API (/api/v1).
//
// Keep this file free of imports and browser or Node specifics: the Vercel API function imports it
// by relative path, and the website imports it through Vite. Dates are plain "YYYY-MM-DD" strings
// and times are "HH:MM" strings; weekdays are derived in UTC from the date string so the answer is
// the same in the browser and on the server.
//
// The rules (identical for both callers):
//   Blocks:  the shift is outside the store's hours for that day (overnight aware), or it overlaps
//            another shift for the same employee on the same date.
//   Warns:   the employee is marked unavailable at that time; the employee has time off that day;
//            the shift pushes the employee past their weekly max hours.
//   Confirm: anything dated before today needs an explicit confirmation (the website asks; the API
//            needs confirm_past).

export const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const MINUTES_PER_DAY = 24 * 60;

export function timeToMinutes(t) {
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(totalMins) {
  const normalized = ((totalMins % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Start and end in minutes from the start of the shift's date. An end at or before the start means
// the shift crosses midnight, so the end moves to the next day.
export function shiftSpan(start, end) {
  const s = timeToMinutes(start);
  let e = timeToMinutes(end);
  if (e <= s) e += MINUTES_PER_DAY;
  return { start: s, end: e };
}

export function shiftHours(start, end) {
  const { start: s, end: e } = shiftSpan(start, end);
  return (e - s) / 60;
}

export function crossesMidnight(start, end) {
  return timeToMinutes(end) <= timeToMinutes(start);
}

// ---- date helpers (all on "YYYY-MM-DD" strings) ----

export function isDateString(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function dayIndexOf(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

export function dayNameOf(dateStr) {
  return DAY_NAMES[dayIndexOf(dateStr)];
}

export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Monday of the week containing dateStr (weeks run Monday to Sunday, like the website).
export function weekStartOf(dateStr) {
  const offset = (dayIndexOf(dateStr) + 6) % 7;
  return addDays(dateStr, -offset);
}

export function daysBetween(fromStr, toStr) {
  return Math.round((Date.parse(`${toStr}T00:00:00Z`) - Date.parse(`${fromStr}T00:00:00Z`)) / 86400000);
}

// ---- store hours ----

export function getStoreHoursFor(settings, dateStr) {
  if (!settings || !dateStr) return null;
  const day = DAY_KEYS[dayIndexOf(dateStr)];
  const open = settings[`${day}_open`];
  const close = settings[`${day}_close`];
  if (!open || !close) return null;
  return { open, close, closes_next_day: timeToMinutes(close) <= timeToMinutes(open) };
}

// Returns null when the shift fits inside store hours (or the day has no hours set), otherwise
// { open, close }.
export function checkStoreHours(storeHours, start, end) {
  if (!storeHours) return null;
  const openMins = timeToMinutes(storeHours.open);
  let closeMins = timeToMinutes(storeHours.close);
  const storeIsOvernight = closeMins <= openMins;
  if (storeIsOvernight) closeMins += MINUTES_PER_DAY;

  let { start: startMins, end: endMins } = shiftSpan(start, end);

  // For overnight stores, a shift starting after midnight (e.g. 00:00-03:00) has startMins = 0,
  // which is numerically before opening even though midnight is within store hours. Shift both
  // endpoints by +24h so they compare correctly against the wrapped closing time.
  if (storeIsOvernight && startMins < openMins && startMins + MINUTES_PER_DAY <= closeMins) {
    startMins += MINUTES_PER_DAY;
    endMins += MINUTES_PER_DAY;
  }

  if (startMins < openMins || endMins > closeMins) {
    return { open: storeHours.open, close: storeHours.close };
  }
  return null;
}

// ---- conflicts ----

// First shift for the same employee on the same date that overlaps the given times, or null.
export function findShiftConflict(employeeId, dateStr, start, end, shifts, ignoreShiftId = null) {
  const { start: a, end: b } = shiftSpan(start, end);
  return (shifts || []).find((s) => {
    if (ignoreShiftId && s.id === ignoreShiftId) return false;
    if (s.employee_id !== employeeId) return false;
    if (s.date !== dateStr) return false;
    const { start: sStart, end: sEnd } = shiftSpan(s.start_time, s.end_time);
    return a < sEnd && b > sStart;
  }) || null;
}

// First unavailable block on that weekday that overlaps the given times, or null.
export function findUnavailability(employee, dateStr, start, end) {
  const blocks = employee && Array.isArray(employee.unavailable_hours) ? employee.unavailable_hours : [];
  if (blocks.length === 0) return null;
  const dayName = dayNameOf(dateStr);
  const { start: a, end: b } = shiftSpan(start, end);
  return blocks.find((block) => {
    if (block.day !== dayName) return false;
    const { start: bStart, end: bEnd } = shiftSpan(block.start_time, block.end_time);
    return a < bEnd && b > bStart;
  }) || null;
}

// Time off entries for the employee on that date that overlap the shift (full day entries always do).
export function findTimeOffConflicts(employeeId, dateStr, start, end, timeOffs) {
  const { start: a, end: b } = shiftSpan(start, end);
  return (timeOffs || []).filter((t) => {
    if (t.employee_id !== employeeId) return false;
    if ((t.start_date || t.date) !== dateStr) return false;
    if (t.full_day !== false) return true;
    if (!t.start_time || !t.end_time) return true;
    const { start: tStart, end: tEnd } = shiftSpan(t.start_time, t.end_time);
    return a < tEnd && b > tStart;
  });
}

// ---- hours ----

// Counted hours for the employee in the Monday to Sunday week containing dateStr. Tentative
// (backup) shifts never count.
export function weeklyHours(employeeId, shifts, dateStr, ignoreShiftId = null) {
  const wk = weekStartOf(dateStr);
  return (shifts || [])
    .filter((s) => {
      if (ignoreShiftId && s.id === ignoreShiftId) return false;
      if (s.employee_id !== employeeId) return false;
      if (s.tentative) return false;
      return weekStartOf(s.date) === wk;
    })
    .reduce((sum, s) => sum + shiftHours(s.start_time, s.end_time), 0);
}

// Same thresholds the website shows next to the hours bar.
export function hoursStatus(employee, hours) {
  if (!employee) return { code: "unknown", label: "" };
  const min = Number(employee.min_hours) || 0;
  const max = Number(employee.max_hours) || null;
  if (max && hours > max) return { code: "over_max", label: `${(hours - max).toFixed(1)}h over max` };
  if (max && hours >= max) return { code: "at_max", label: "Fully booked" };
  if (max && max - hours <= 4) return { code: "near_max", label: `${(max - hours).toFixed(1)}h to max` };
  if (min && hours < min) return { code: "under_min", label: `${(min - hours).toFixed(1)}h to min` };
  return { code: "ok", label: "Within range" };
}

// ---- everything at once (used by the API) ----

// shift: { employee_id, date, start_time, end_time, tentative }
// Returns { blocked, store_hours, store_hours_violation, conflict, unavailable, time_off, past,
//           shift_hours, weekly_hours_before, weekly_hours_after, hours_status }
export function evaluateShift({ shift, employee, shifts, timeOffs, settings, today, ignoreShiftId = null }) {
  const { employee_id, date, start_time, end_time } = shift;
  const storeHours = getStoreHoursFor(settings, date);
  const storeHoursViolation = checkStoreHours(storeHours, start_time, end_time);
  const conflict = findShiftConflict(employee_id, date, start_time, end_time, shifts, ignoreShiftId);
  const unavailable = findUnavailability(employee, date, start_time, end_time);
  const timeOff = findTimeOffConflicts(employee_id, date, start_time, end_time, timeOffs);
  const before = weeklyHours(employee_id, shifts, date, ignoreShiftId);
  const thisHours = shiftHours(start_time, end_time);
  const after = before + (shift.tentative ? 0 : thisHours);
  return {
    blocked: !!(storeHoursViolation || conflict),
    store_hours: storeHours,
    store_hours_violation: storeHoursViolation,
    conflict,
    unavailable,
    time_off: timeOff,
    past: today ? date < today : false,
    shift_hours: thisHours,
    weekly_hours_before: before,
    weekly_hours_after: after,
    hours_status: hoursStatus(employee, after),
  };
}
