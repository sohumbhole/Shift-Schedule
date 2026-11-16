// Unit test of the API's employee `inactive` handling with an in memory fake database (no network,
// no Supabase). Run from the repo root: node scripts/tests/api_inactive_unit.mjs
import assert from 'node:assert/strict';
import { listEmployees, getEmployee, getAvailability } from '../../api/_lib/handlers_read.js';
import { updateEmployee, createEmployee } from '../../api/_lib/handlers_other.js';
import { checkShift } from '../../api/_lib/rules.js';

const settings = { id: 's1', employee_order: [], metadata: { inactive_employee_ids: ['e4'] } };
for (const d of ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']) { settings[`${d}_open`] = '08:00'; settings[`${d}_close`] = '02:00'; }
const employees = [
  { id: 'e1', name: 'Preeti Sharma', title: 'Cook', min_hours: 10, inactive: false, created_at: '2026-01-01' },
  { id: 'e2', name: 'Ravi Kumar', title: 'Cook', min_hours: 10, inactive: true, created_at: '2026-01-02' },
  { id: 'e3', name: 'Jumbo Lee', title: 'Cashier', min_hours: 10, inactive: true, created_at: '2026-01-03' },
  { id: 'e4', name: 'Amy', title: 'Cashier', min_hours: 10, inactive: false, created_at: '2026-01-04' }, // legacy list
];
const shifts = [{ id: 's1', employee_id: 'e3', employee_name: 'Jumbo Lee', date: '2026-11-18', start_time: '10:00', end_time: '16:00' }];
const db = {
  settings: async () => settings,
  employees: async () => employees,
  shifts: async ({ employeeIds } = {}) => shifts.filter((s) => !employeeIds || employeeIds.includes(s.employee_id)),
  timeOff: async () => [],
};
const ctx = (extra) => ({ db, today: '2026-11-16', query: {}, params: {}, body: {}, dryRun: false, ...extra });
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n += 1; };

const all = (await listEmployees(ctx())).data.employees;
ok(all.length === 4, 'list returns everyone by default');
ok(JSON.stringify(all.map((e) => [e.name, e.inactive])) === JSON.stringify([['Preeti Sharma', false], ['Ravi Kumar', true], ['Jumbo Lee', true], ['Amy', true]]), 'each employee carries inactive; legacy list counts');
const act = (await listEmployees(ctx({ query: { inactive: 'false' } }))).data.employees.map((e) => e.name);
ok(JSON.stringify(act) === '["Preeti Sharma"]', 'inactive=false filter');
const inact = await listEmployees(ctx({ query: { inactive: 'true' } }));
ok(inact.data.employees.length === 3 && /inactive/.test(inact.message), 'inactive=true filter and message');

const one = (await getEmployee(ctx({ params: { id: 'Ravi' } }))).data.employee;
ok(one.inactive === true, 'single employee read has inactive');

const av = await getAvailability(ctx({ query: { date: '2026-11-18', start_time: '17:00', end_time: '22:00' } }));
const names = av.data.employees.map((r) => r.employee_name);
ok(!names.includes('Ravi Kumar') && !names.includes('Amy'), 'availability leaves out inactive people');
ok(names.includes('Jumbo Lee'), 'but keeps an inactive person who already works that day');
ok(/left out/.test(av.message), 'and says how many were left out');
const avAll = await getAvailability(ctx({ query: { date: '2026-11-18', start_time: '17:00', end_time: '22:00', include_inactive: 'true' } }));
const ravi = avAll.data.employees.find((r) => r.employee_name === 'Ravi Kumar');
ok(ravi && ravi.inactive && ravi.reasons.some((r) => r.code === 'INACTIVE') && ravi.status === 'possible_with_warnings', 'include_inactive brings them back with an INACTIVE reason');

const up = await updateEmployee(ctx({ params: { id: 'Ravi' }, body: { inactive: false }, dryRun: true }));
ok(up.data.would_become.inactive === false && !up.warnings.some((w) => w.code === 'UNKNOWN_FIELD'), 'PATCH accepts inactive');
await assert.rejects(updateEmployee(ctx({ params: { id: 'Ravi' }, body: { inactive: 'maybe' }, dryRun: true })), /inactive/); n += 1;
const cr = await createEmployee(ctx({ body: { name: 'New Person', title: 'Prep', min_hours: 5, inactive: true }, dryRun: true }));
ok(cr.data.would_create.inactive === true, 'POST accepts inactive');

const emp = employees[1];
const chk = checkShift({ shift: { employee_id: 'e2', date: '2026-11-20', start_time: '10:00', end_time: '16:00' }, employee: emp, shifts: [], timeOffs: [], settings, today: '2026-11-16' });
ok(chk.warnings.some((w) => w.code === 'EMPLOYEE_INACTIVE') && !chk.blocked, 'shift for an inactive employee warns, not blocks');

console.log(`api_inactive_unit: ${n} checks passed`);
