// Proves src/lib/shiftRules.js gives the same answers as the ORIGINAL AddShiftModal logic.
// The original functions below are copied verbatim from AddShiftModal.jsx (before the refactor).
// Data: the busiest account's employees, shifts and store settings in the newest local backup
// (read only; nothing is written anywhere). Run from the repo root: node scripts/tests/rules_equivalence.mjs
import fs from 'node:fs';
import path from 'node:path';
import { format, isSameWeek } from 'date-fns';
import * as R from '../../src/lib/shiftRules.js';

const BACKUPS = path.resolve('..', 'Backups');
const latest = fs.readdirSync(BACKUPS, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name.startsWith('backup-')).map((d) => d.name).sort().pop();
const momDir = fs.readdirSync(path.join(BACKUPS, latest), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => ({ d: d.name, n: JSON.parse(fs.readFileSync(path.join(BACKUPS, latest, d.name, 'shifts.json'), 'utf8')).length }))
  .sort((a, b) => b.n - a.n)[0].d;
const load = (f) => JSON.parse(fs.readFileSync(path.join(BACKUPS, latest, momDir, f), 'utf8'));
const employees = load('employees.json');
const allShifts = load('shifts.json');
const settings = load('store_settings.json')[0];

// ---------------- ORIGINAL (verbatim) ----------------
const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
function getStoreHours(settings, date) {
  if (!settings || !date) return null;
  const day = DAY_KEYS[date.getDay()];
  const open = settings[`${day}_open`];
  const close = settings[`${day}_close`];
  if (!open || !close) return null;
  return { open, close };
}
function timeToMinutes(t) { const [h, m] = t.split(":").map(Number); return h * 60 + m; }
function timeToHours(start, end) {
  const [sh, sm] = start.split(":").map(Number); const [eh, em] = end.split(":").map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm); if (diff <= 0) diff += 24 * 60; return diff / 60;
}
function getWeeklyHours(employeeId, shifts, weekDate) {
  return shifts.filter((s) => {
    if (s.employee_id !== employeeId) return false;
    if (s.tentative) return false;
    const sd = new Date(s.date + "T00:00:00");
    return isSameWeek(sd, weekDate, { weekStartsOn: 1 });
  }).reduce((sum, s) => sum + timeToHours(s.start_time, s.end_time), 0);
}
function originalChecks({ selectedEmp, shiftDate, startTime, endTime, shiftsForCalc, storeSettings }) {
  const storeHours = getStoreHours(storeSettings, shiftDate);
  let unavailable = null;
  if (selectedEmp && selectedEmp.unavailable_hours && selectedEmp.unavailable_hours.length > 0 && shiftDate) {
    const dayName = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][shiftDate.getDay()];
    const shiftStartMins = timeToMinutes(startTime);
    let shiftEndMins = timeToMinutes(endTime);
    if (shiftEndMins <= shiftStartMins) shiftEndMins += 24 * 60;
    unavailable = selectedEmp.unavailable_hours.find((block) => {
      if (block.day !== dayName) return false;
      const bStart = timeToMinutes(block.start_time);
      let bEnd = timeToMinutes(block.end_time);
      if (bEnd <= bStart) bEnd += 24 * 60;
      return shiftStartMins < bEnd && shiftEndMins > bStart;
    }) || null;
  }
  let conflict = null;
  if (selectedEmp && shiftDate) {
    const dateStr = format(shiftDate, "yyyy-MM-dd");
    const shiftStartMins = timeToMinutes(startTime);
    let shiftEndMins = timeToMinutes(endTime);
    if (shiftEndMins <= shiftStartMins) shiftEndMins += 24 * 60;
    conflict = shiftsForCalc.find((s) => {
      if (s.employee_id !== selectedEmp.id) return false;
      if (s.date !== dateStr) return false;
      const sStart = timeToMinutes(s.start_time);
      let sEnd = timeToMinutes(s.end_time);
      if (sEnd <= sStart) sEnd += 24 * 60;
      return shiftStartMins < sEnd && shiftEndMins > sStart;
    }) || null;
  }
  let closed = false;
  if (storeHours) {
    const openMins = timeToMinutes(storeHours.open);
    let closeMins = timeToMinutes(storeHours.close);
    const storeIsOvernight = closeMins <= openMins;
    if (storeIsOvernight) closeMins += 24 * 60;
    let startMins = timeToMinutes(startTime);
    let endMins = timeToMinutes(endTime);
    if (endMins <= startMins) endMins += 24 * 60;
    if (storeIsOvernight && startMins < openMins && startMins + 24 * 60 <= closeMins) { startMins += 24 * 60; endMins += 24 * 60; }
    if (startMins < openMins || endMins > closeMins) closed = true;
  }
  return { unavailable, conflict, closed, hours: getWeeklyHours(selectedEmp.id, shiftsForCalc, shiftDate) };
}

// ---------------- compare ----------------
let seed = 12345;
const rand = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
const grid = []; for (let m = 0; m < 1440; m += 15) grid.push(R.minutesToTime(m));
const dates = [...new Set(allShifts.map((s) => s.date))];

// Give one employee extra unavailability blocks (in memory only) so that branch is exercised hard.
const empsForTest = employees.map((e, i) => i % 3 === 0 ? { ...e, unavailable_hours: [
  ...(e.unavailable_hours || []),
  { day: 'Saturday', start_time: '00:00', end_time: '23:59' },
  { day: 'Tuesday', start_time: '18:00', end_time: '02:00' },
  { day: 'Friday', start_time: '09:00', end_time: '13:30' } ] } : e);

let cases = 0, mismatches = 0, closedCount = 0, conflictCount = 0, unavailCount = 0;
const N = 20000;
for (let i = 0; i < N; i++) {
  const emp = empsForTest[rand(empsForTest.length)];
  const dateStr = dates[rand(dates.length)];
  const startTime = grid[rand(grid.length)];
  const endTime = grid[rand(grid.length)];
  const editing = rand(4) === 0 ? allShifts[rand(allShifts.length)] : null;
  const shiftsForCalc = editing ? allShifts.filter((s) => s.id !== editing.id) : allShifts;
  const shiftDate = new Date(dateStr + 'T00:00:00');

  const o = originalChecks({ selectedEmp: emp, shiftDate, startTime, endTime, shiftsForCalc, storeSettings: settings });
  const n = {
    unavailable: R.findUnavailability(emp, dateStr, startTime, endTime),
    conflict: R.findShiftConflict(emp.id, dateStr, startTime, endTime, allShifts, editing ? editing.id : null),
    closed: !!R.checkStoreHours(R.getStoreHoursFor(settings, dateStr), startTime, endTime),
    hours: R.weeklyHours(emp.id, allShifts, dateStr, editing ? editing.id : null),
  };
  cases++;
  if (o.closed) closedCount++; if (o.conflict) conflictCount++; if (o.unavailable) unavailCount++;
  const same = o.closed === n.closed
    && (o.conflict?.id ?? null) === (n.conflict?.id ?? null)
    && o.unavailable === n.unavailable
    && Math.abs(o.hours - n.hours) < 1e-9;
  if (!same) {
    mismatches++;
    if (mismatches <= 5) console.log('MISMATCH', { emp: emp.id, dateStr, startTime, endTime, o: { ...o, conflict: o.conflict?.id }, n: { ...n, conflict: n.conflict?.id } });
  }
}
// Hours thresholds must match the HoursStatus component's branches.
console.log(`backup used: ${latest} (busiest account)`);
console.log(`cases: ${cases} | original blocked by hours: ${closedCount} | by conflict: ${conflictCount} | unavailable hits: ${unavailCount}`);
console.log(`MISMATCHES: ${mismatches}`);
process.exit(mismatches === 0 ? 0 : 1);
