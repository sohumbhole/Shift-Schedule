// Helpers shared by the endpoint handlers.
import { problem } from './http.js';
import { employeeIndex, orderEmployees, dayView, employeeWeek } from './format.js';
import { weekStartOf, addDays } from '../../src/lib/shiftRules.js';

export const LIMITS = {
  schedule_max_days: 93,
  list_max_days: 366,
  list_default_limit: 200,
  list_max_limit: 1000,
  batch_max_shifts: 100,
  clear_max_days: 31,
  time_off_max_days: 62,
  note_max_chars: 2000,
  changes_max_limit: 100,
};

export const EMPLOYEE_COLORS = [
  '#FF8C00', '#3B82F6', '#10B981', '#8B5CF6',
  '#EC4899', '#F59E0B', '#06B6D4', '#EF4444',
  '#6366F1', '#14B8A6', '#F97316', '#84CC16',
];

// Settings and employees, loaded once per request.
export async function base(ctx) {
  if (!ctx._base) {
    ctx._base = (async () => {
      const [settings, rawEmployees] = await Promise.all([ctx.db.settings(), ctx.db.employees()]);
      const employees = orderEmployees(rawEmployees, settings);
      return { settings, employees, empIdx: employeeIndex(employees) };
    })();
  }
  return ctx._base;
}

// Warns about body fields the endpoint does not use, so typos do not silently do nothing.
export function unknownFieldWarnings(body, allowed) {
  const extra = Object.keys(body || {}).filter((k) => !allowed.includes(k));
  if (!extra.length) return [];
  return [problem('UNKNOWN_FIELD', `Ignored field(s) this endpoint does not use: ${extra.join(', ')}.`, {
    hint: `Accepted fields: ${allowed.join(', ')}.`, details: { ignored: extra },
  })];
}

export function weeksCovering(dates) {
  const set = new Set(dates.filter(Boolean).map(weekStartOf));
  return [...set].sort();
}

// How the affected days and employee weeks look. Reads fresh from the database unless shift and
// time off lists are given (dry runs pass the would-be lists).
export async function afterContext(ctx, { dates = [], employeeIds = [], shifts = null, timeOffs = null }) {
  const { settings, empIdx } = await base(ctx);
  const weeks = weeksCovering(dates);
  if (!weeks.length) return { days: [], employee_weeks: [] };
  const start = weeks[0];
  const end = addDays(weeks[weeks.length - 1], 6);
  const allShifts = shifts || await ctx.db.shifts({ start, end });
  const uniqDates = [...new Set(dates.filter(Boolean))].sort();
  const allTimeOff = timeOffs || (uniqDates.length ? await ctx.db.timeOff({ start: uniqDates[0], end: uniqDates[uniqDates.length - 1] }) : []);
  const days = uniqDates.map((d) => dayView(d, allShifts, allTimeOff, settings, empIdx));
  const employee_weeks = [];
  for (const id of [...new Set(employeeIds.filter(Boolean))]) {
    const emp = empIdx.get(id);
    if (!emp) continue;
    for (const w of weeks) employee_weeks.push(employeeWeek(emp, allShifts, w, empIdx));
  }
  return { days, employee_weeks };
}

export function plural(n, word, pluralWord = `${word}s`) {
  return `${n} ${n === 1 ? word : pluralWord}`;
}

// "Not added: <first error>" plus a count when there are several.
export function failureMessage(prefix, errors) {
  if (!errors.length) return prefix;
  return errors.length === 1
    ? `${prefix}: ${errors[0].message}`
    : `${prefix} (${errors.length} problems): ${errors[0].message} See errors for the rest.`;
}
