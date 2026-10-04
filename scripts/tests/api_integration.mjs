// Integration test for /api/v1: calls the real handler in process against the LIVE database, but only
// in the account named by API_TEST_EMAIL (use a test account, never the restaurant's), only in empty
// weeks of 2030 (it refuses to run if 2030 has data), and it deletes everything it creates.
//
// Run from the repo root:  API_TEST_EMAIL=<test account email> node scripts/tests/api_integration.mjs
// The isolation checks also need a second account with no shifts; they are skipped if none exists.
import fs from 'node:fs';
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}
const { default: handler } = await import('../../api/v1/index.js');
const { createClient } = await import('@supabase/supabase-js');
const store = await import('../../api/_lib/store.js');

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const TEST_EMAIL = (process.env.API_TEST_EMAIL || '').trim().toLowerCase();
if (!TEST_EMAIL) {
  console.log('Set API_TEST_EMAIL to the email of a TEST account (never the restaurant account).');
  process.exit(2);
}
const { data: users } = await sb.auth.admin.listUsers();
const sohum = users.users.find((u) => (u.email || '').toLowerCase() === TEST_EMAIL);
if (!sohum) { console.log(`No account with email ${TEST_EMAIL}.`); process.exit(2); }
// Second account for the isolation checks: one with no shifts at all, so nothing real is touched.
let other = null;
for (const u of users.users) {
  if (u.id === sohum.id) continue;
  const { count: n } = await sb.from('shifts').select('id', { count: 'exact', head: true }).eq('user_id', u.id);
  if (n === 0) { other = u; break; }
}
if (!other) { console.log('No empty second account found; isolation checks need one.'); process.exit(2); }

const W1 = '2030-01-07'; // Monday
const W2 = '2030-01-14';
const YEAR = ['2030-01-01', '2030-12-31'];
const count = async (table, col) => (await sb.from(table).select('id', { count: 'exact', head: true }).eq('user_id', sohum.id).gte(col, YEAR[0]).lte(col, YEAR[1])).count;
const pre = { shifts: await count('shifts', 'date'), time_off: await count('time_off', 'start_date'), events: await count('events', 'start_date') };
if (pre.shifts || pre.time_off || pre.events) { console.log('ABORT: 2030 is not empty in the test account', pre); process.exit(1); }

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, info) {
  if (cond) { pass++; } else { fail++; failures.push(name); console.log(`FAIL ${name}`, info !== undefined ? JSON.stringify(info).slice(0, 900) : ''); }
}

function call(method, path, { query = {}, body, key, headers = {} } = {}) {
  const h = { ...headers };
  if (key) h.authorization = `Bearer ${key}`;
  const req = { method, url: `/api/v1/${path}`, query: { ...query, path }, headers: Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v])), body: body === undefined ? undefined : JSON.stringify(body) };
  return new Promise((resolve) => {
    const res = {
      statusCode: 200, headers: {},
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      end(chunk) {
        const text = chunk ? String(chunk) : '';
        let json = null;
        try { json = JSON.parse(text); } catch { /* text */ }
        resolve({ status: this.statusCode, headers: this.headers, text, json });
      },
    };
    handler(req, res).catch((e) => resolve({ status: 'THROWN', text: e.stack }));
  });
}
const codes = (r) => (r.json?.errors || []).map((e) => e.code);
const wcodes = (r) => (r.json?.warnings || []).map((e) => e.code);

// ---- keys ----
const { key: WRITE } = await store.createApiKey(sb, { userId: sohum.id, name: 'TEST write', scopes: ['read', 'write'] });
const { key: READ, record: readRec } = await store.createApiKey(sb, { userId: sohum.id, name: 'TEST read', scopes: ['read'] });
const { key: OTHER } = await store.createApiKey(sb, { userId: other.id, name: 'TEST other account', scopes: ['read', 'write'] });

try {
  // ---- public ----
  let r = await call('GET', '');
  check('index ok', r.status === 200 && r.json.ok && r.json.data.endpoints.length > 30, r.json);
  r = await call('GET', 'docs');
  check('docs markdown', r.status === 200 && r.text.startsWith('# Shift Schedule API') && r.headers['content-type'].includes('markdown'));
  r = await call('GET', 'openapi.json');
  check('openapi parses', r.status === 200 && r.json.openapi === '3.1.0' && Object.keys(r.json.paths).length > 20);
  r = await call('GET', 'nope', { key: WRITE });
  check('unknown route 404', r.status === 404 && codes(r)[0] === 'ROUTE_NOT_FOUND');
  r = await call('PUT', 'shifts', { key: WRITE, body: {} });
  check('wrong method 405', r.status === 405 && codes(r)[0] === 'METHOD_NOT_ALLOWED', r.json);

  // ---- auth ----
  r = await call('GET', 'me');
  check('no key 401', r.status === 401 && codes(r)[0] === 'AUTH_REQUIRED');
  r = await call('GET', 'me', { key: 'sk_shift_bogus' });
  check('bad key 401', r.status === 401 && codes(r)[0] === 'INVALID_API_KEY');
  r = await call('GET', 'me', { query: { api_key: WRITE } });
  check('key in URL refused', r.status === 400 && codes(r)[0] === 'API_KEY_IN_URL');
  r = await call('GET', 'me', { key: 'eyJhbGciOiJIUzI1NiJ9.e30.bad' });
  check('bad session 401', r.status === 401 && codes(r)[0] === 'INVALID_SESSION');
  r = await call('GET', 'me', { headers: { 'x-api-key': WRITE } });
  check('X-API-Key works', r.status === 200 && r.json.ok, r.json);
  r = await call('GET', 'tokens', { key: WRITE });
  check('keys endpoint needs session', r.status === 403 && codes(r)[0] === 'SESSION_REQUIRED');

  // ---- reads ----
  r = await call('GET', 'me', { key: WRITE });
  check('me ok', r.json.ok && r.json.data.auth.access === 'read_write' && r.json.meta.today, r.json);
  r = await call('GET', 'settings', { key: WRITE });
  check('settings ok', r.json.ok && r.json.data.settings && r.json.data.settings.hours.monday !== undefined, r.json);
  const settings = r.json.data.settings;
  r = await call('GET', 'employees', { key: WRITE });
  check('employees ok', r.json.ok && r.json.data.employees.length >= 2, r.json);
  const emps = r.json.data.employees;
  const A = emps[0];
  const B = emps[1];
  const mon = settings.hours.monday;
  console.log('store hours monday:', JSON.stringify(mon), '| A:', A.name, '| B:', B.name);
  const add = (t, h) => { const [hh, mm] = t.split(':').map(Number); const m = ((hh * 60 + mm + h * 60) % 1440 + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
  const S1 = mon ? add(mon.open, 1) : '10:00';
  const E1 = mon ? add(mon.open, 5) : '14:00';

  r = await call('GET', 'schedule', { key: WRITE });
  check('schedule default this week', r.json.ok && r.json.data.days.length === 7 && r.json.data.totals.by_employee.length === emps.length, r.json?.message);
  r = await call('GET', 'schedule', { key: WRITE, query: { start: '2026-01-01', end: '2026-06-30' } });
  check('schedule range cap', r.status === 400 && codes(r)[0] === 'RANGE_TOO_LARGE', r.json);
  r = await call('GET', 'schedule', { key: WRITE, query: { preset: 'tomorrow', employee: A.name.split(' ')[0] } });
  check('schedule tomorrow + employee filter', r.json.ok && r.json.data.days.length === 1 && r.json.data.filters.employees[0].id === A.id, r.json);
  r = await call('GET', 'schedule', { key: WRITE, query: { preset: 'bogus' } });
  check('schedule bad preset', r.status === 400 && codes(r)[0] === 'INVALID_VALUE');
  r = await call('GET', 'shifts', { key: WRITE, query: { limit: 3 } });
  check('shifts paged', r.json.ok && r.json.data.shifts.length <= 3 && r.json.data.page.limit === 3 && typeof r.json.data.page.total === 'number', r.json?.data?.page);
  r = await call('GET', 'availability', { key: WRITE, query: { date: W1, start_time: S1, end_time: E1 } });
  check('availability', r.json.ok && r.json.data.employees.length === emps.length && r.json.data.employees.every((e) => e.status === 'free' || e.status === 'possible_with_warnings'), r.json);
  r = await call('GET', `employees/${encodeURIComponent(A.name)}`, { key: WRITE });
  check('employee by name', r.json.ok && r.json.data.employee.id === A.id, r.json);
  r = await call('GET', 'employees/zzzz_nobody', { key: WRITE });
  check('employee not found', r.status === 404 && codes(r)[0] === 'EMPLOYEE_NOT_FOUND' && r.json.errors[0].details.employees.length > 0);
  r = await call('GET', 'notes', { key: WRITE });
  check('notes list', r.json.ok && Array.isArray(r.json.data.notes));
  r = await call('GET', 'changes/latest', { key: WRITE });
  check('changes latest', r.json.ok, r.json);

  // ---- read only key cannot write ----
  r = await call('POST', 'shifts', { key: READ, body: { employee: A.id, date: W1, start_time: S1, end_time: E1 } });
  check('read key cannot write', r.status === 403 && codes(r)[0] === 'FORBIDDEN_SCOPE');

  // ---- create shift ----
  const before = await count('shifts', 'date');
  r = await call('POST', 'shifts', { key: WRITE, body: { employee: A.id, date: W1, start_time: S1, end_time: E1, dry_run: true } });
  check('dry run create', r.json.ok && r.json.meta.dry_run && r.json.data.would_create && (await count('shifts', 'date')) === before, r.json);
  r = await call('POST', 'shifts', { key: WRITE, body: { employee: A.id, date: W1, start_time: S1, end_time: E1 } });
  check('create shift 201', r.status === 201 && r.json.ok && r.json.data.shift.id && r.json.data.day.shifts.length === 1 && r.json.data.employee_week.shift_count === 1 && r.json.data.change.change_id, r.json);
  const shift1 = r.json.data?.shift;
  const create1Change = r.json.data?.change?.change_id;
  r = await call('POST', 'shifts', { key: WRITE, body: { employee: A.id, date: W1, start_time: add(S1, 1), end_time: add(E1, 1) } });
  check('overlap -> SHIFT_CONFLICT 409', r.status === 409 && codes(r)[0] === 'SHIFT_CONFLICT' && r.json.errors[0].details.conflicting_shift.id === shift1?.id && r.json.errors[0].hint, r.json);
  if (mon) {
    r = await call('POST', 'shifts', { key: WRITE, body: { employee: B.id, date: W1, start_time: add(mon.open, -2), end_time: add(mon.open, 2) } });
    check('outside hours -> 422', r.status === 422 && codes(r)[0] === 'OUTSIDE_STORE_HOURS', r.json);
  }
  r = await call('POST', 'shifts', { key: WRITE, body: { employee: B.id, date: '2020-01-06', start_time: S1, end_time: E1 } });
  check('past date needs confirm', r.status === 409 && codes(r).includes('PAST_DATE_NOT_CONFIRMED'), r.json);
  r = await call('POST', 'shifts', { key: WRITE, body: { employee: B.id, date: W1, start_time: '10:10', end_time: E1 } });
  check('quarter hour enforced', r.status === 400 && codes(r)[0] === 'TIME_NOT_ON_QUARTER_HOUR');
  r = await call('POST', 'shifts', { key: WRITE, body: { employee: B.id, date: 'tomorrowish', start_time: S1, end_time: E1 } });
  check('bad date', r.status === 400 && codes(r)[0] === 'INVALID_DATE');
  r = await call('POST', 'shifts', { key: WRITE, body: { employee: B.id, date: W1, start_time: S1, end_time: E1, dry_run: true, bogus_field: 1 } });
  check('unknown field warning', r.json.ok && wcodes(r).includes('UNKNOWN_FIELD'), r.json);
  const pmStart = (() => { const [h, m] = S1.split(':').map(Number); const h12 = h % 12 || 12; return `${h12}:${String(m).padStart(2, '0')}${h >= 12 ? 'pm' : 'am'}`; })();
  r = await call('POST', 'shifts', { key: WRITE, body: { employee: B.name, date: W1, start_time: pmStart, end_time: E1, dry_run: true } });
  check('12h time + name accepted', r.json.ok && r.json.data.would_create.start_time === S1, r.json);

  // ---- update + undo + redo ----
  r = await call('PATCH', `shifts/${shift1.id}`, { key: WRITE, body: { start_time: add(S1, 1) } });
  check('patch shift', r.json.ok && r.json.data.shift.start_time === add(S1, 1) && r.json.data.before.start_time === S1, r.json);
  const patchChange = r.json.data?.change?.change_id;
  r = await call('POST', `changes/${patchChange}/undo`, { key: WRITE, body: {} });
  check('undo patch', r.json.ok, r.json);
  const redoId = r.json.data?.change?.change_id;
  let s = await call('GET', `shifts/${shift1.id}`, { key: WRITE });
  check('undo restored time', s.json.data.shift.start_time === S1, s.json);
  r = await call('POST', `changes/${patchChange}/undo`, { key: WRITE, body: {} });
  check('double undo refused', r.status === 409 && codes(r)[0] === 'ALREADY_UNDONE');
  r = await call('POST', `changes/${redoId}/undo`, { key: WRITE, body: {} });
  s = await call('GET', `shifts/${shift1.id}`, { key: WRITE });
  check('redo (undo the undo)', r.json.ok && s.json.data.shift.start_time === add(S1, 1), { r: r.json, s: s.json });
  await call('PATCH', `shifts/${shift1.id}`, { key: WRITE, body: { start_time: S1 } });
  r = await call('POST', `changes/${patchChange}/undo`, { key: WRITE, body: {} });
  check('undo of stale change refused', r.status === 409, r.json);

  // ---- batch ----
  const batch = [
    { employee: B.id, date: W1, start_time: S1, end_time: E1 },
    { employee: B.id, date: W1, start_time: add(S1, 1), end_time: add(E1, 1) },
    { employee: A.id, date: '2030-01-08', start_time: S1, end_time: E1 },
  ];
  r = await call('POST', 'shifts/batch', { key: WRITE, body: { shifts: batch } });
  check('batch atomic refused', r.status === 409 && r.json.data.results[1].errors[0].code === 'SHIFT_CONFLICT' && (await count('shifts', 'date')) === before + 1, r.json);
  r = await call('POST', 'shifts/batch', { key: WRITE, body: { shifts: batch, atomic: false } });
  check('batch partial 207', r.status === 207 && r.json.data.created.length === 2 && wcodes(r).includes('SOME_SHIFTS_SKIPPED'), r.json);

  // ---- idempotency ----
  const idem = { 'idempotency-key': `test-${Date.now()}` };
  const body1 = { employee: A.id, date: '2030-01-09', start_time: S1, end_time: E1 };
  const n0 = await count('shifts', 'date');
  r = await call('POST', 'shifts', { key: WRITE, body: body1, headers: idem });
  const r2 = await call('POST', 'shifts', { key: WRITE, body: body1, headers: idem });
  check('idempotent replay', r.status === 201 && r2.status === 201 && r2.json.meta.idempotent_replay === true && (await count('shifts', 'date')) === n0 + 1, { r: r.json?.message, r2: r2.json?.meta });
  r = await call('POST', 'shifts', { key: WRITE, body: { ...body1, date: '2030-01-10' }, headers: idem });
  check('idempotency key reuse refused', r.status === 409 && codes(r)[0] === 'IDEMPOTENCY_KEY_REUSED');

  // ---- copy week + undo ----
  r = await call('POST', 'schedule/copy-week', { key: WRITE, body: { to_week: W2, dry_run: true } });
  check('copy week dry run', r.json.ok && r.json.data.would_create.length === 4, r.json);
  r = await call('POST', 'schedule/copy-week', { key: WRITE, body: { to_week: W2 } });
  check('copy week', r.status === 201 && r.json.data.created_shifts.length === 4 && r.json.data.created_shifts.every((x) => x.date >= W2), r.json);
  const copyChange = r.json.data?.change?.change_id;
  r = await call('POST', `changes/${copyChange}/undo`, { key: WRITE, body: {} });
  const w2count = (await sb.from('shifts').select('id', { count: 'exact', head: true }).eq('user_id', sohum.id).gte('date', W2).lte('date', '2030-01-20')).count;
  check('undo copy week', r.json.ok && w2count === 0, { r: r.json, w2count });

  // ---- clear + undo ----
  r = await call('POST', 'shifts/clear', { key: WRITE, body: { week: W1 } });
  check('clear needs confirm', r.status === 409 && codes(r).includes('CONFIRM_REQUIRED'), r.json);
  r = await call('POST', 'shifts/clear', { key: WRITE, body: { week: W1, confirm: true } });
  check('clear week', r.json.ok && r.json.data.cleared.shifts.length === 4 && (await count('shifts', 'date')) === 0, r.json);
  const clearChange = r.json.data?.change?.change_id;
  r = await call('POST', `changes/${clearChange}/undo`, { key: WRITE, body: {} });
  check('undo clear', r.json.ok && (await count('shifts', 'date')) === 4, r.json);

  // ---- time off ----
  r = await call('POST', 'time-off', { key: WRITE, body: { employee: A.id, date: W1, reason: 'API TEST' } });
  check('time off create + shift warning', r.status === 201 && wcodes(r).includes('SHIFT_DURING_TIME_OFF'), r.json);
  const toId = r.json.data?.time_off?.[0]?.id;
  r = await call('POST', 'shifts', { key: WRITE, body: { employee: A.id, date: W1, start_time: add(E1, 1), end_time: add(E1, 2), dry_run: true } });
  check('shift on time off day warns', r.json.ok && wcodes(r).includes('TIME_OFF_THAT_DAY'), r.json);
  r = await call('PATCH', `time-off/${toId}`, { key: WRITE, body: { full_day: false, start_time: S1, end_time: E1, type: 'custom_time_off' } });
  check('time off update', r.json.ok && r.json.data.time_off.full_day === false && r.json.data.time_off.type === 'custom_time_off', r.json);
  r = await call('POST', 'time-off', { key: WRITE, body: { employee: B.id, start_date: '2030-01-15', end_date: '2030-01-17', type: 'custom_time_off' } });
  check('time off range = 3 entries', r.status === 201 && r.json.data.time_off.length === 3, r.json);
  r = await call('GET', 'time-off', { key: WRITE, query: { start: '2030-01-01', end: '2030-01-31' } });
  check('time off list', r.json.ok && r.json.data.time_off.length === 4, r.json?.message);
  r = await call('DELETE', `time-off/${toId}`, { key: WRITE });
  check('time off delete', r.json.ok, r.json);

  // ---- events ----
  r = await call('POST', 'events', { key: WRITE, body: { name: 'API TEST event', start_date: W1, end_date: '2030-01-09' } });
  check('event create', r.status === 201 && r.json.data.event.end_date === '2030-01-09', r.json);
  const evId = r.json.data?.event?.id;
  r = await call('PATCH', `events/${evId}`, { key: WRITE, body: { all_day: false, start_time: '09:00', end_time: '12:00' } });
  check('event update', r.json.ok && r.json.data.event.all_day === false, r.json);
  r = await call('GET', 'schedule', { key: WRITE, query: { week: W1 } });
  check('schedule shows 2030 data', r.json.ok && r.json.data.summary.shifts === 4 && r.json.data.summary.events === 1 && r.json.data.days[1].events.length === 1, r.json?.data?.summary);
  r = await call('DELETE', `events/${evId}`, { key: WRITE });
  check('event delete', r.json.ok, r.json);

  // ---- notes ----
  r = await call('PUT', `notes/${W1}`, { key: WRITE, body: { text: 'API TEST note' } });
  check('note set', r.status === 201 && r.json.data.note.week_start === W1, r.json);
  r = await call('PUT', 'notes/2030-01-09', { key: WRITE, body: { text: 'second line', append: true } });
  check('note append (any date in week)', r.json.ok && r.json.data.note.text === 'API TEST note\nsecond line', r.json);
  r = await call('PUT', `notes/${W1}`, { key: WRITE, body: { text: 'x'.repeat(2001) } });
  check('note too long', r.status === 400 && codes(r)[0] === 'NOTE_TOO_LONG');
  r = await call('DELETE', `notes/${W1}`, { key: WRITE });
  const delNote = r.json.data?.change?.change_id;
  r = await call('POST', `changes/${delNote}/undo`, { key: WRITE, body: {} });
  let n = await call('GET', `notes/${W1}`, { key: WRITE });
  check('note delete + undo', r.json.ok && n.json.data.note.text === 'API TEST note\nsecond line', n.json);
  await call('DELETE', `notes/${W1}`, { key: WRITE });
  n = await call('GET', `notes/${W1}`, { key: WRITE });
  check('note gone', n.json.data.note.text === null);

  // ---- employees ----
  r = await call('POST', 'employees', { key: WRITE, body: { name: 'API Test Person', title: 'tester', min_hours: 0, max_hours: 10, unavailable_hours: [{ day: 'friday', start_time: '00:00', end_time: '23:59' }] } });
  check('employee create', r.status === 201 && r.json.data.employee.unavailable_hours[0].day === 'Friday', r.json);
  const T = r.json.data?.employee;
  r = await call('POST', 'employees', { key: WRITE, body: { name: 'No Title' } });
  check('employee needs title', r.status === 400 && codes(r)[0] === 'MISSING_FIELD');
  r = await call('PATCH', 'employees/API Test Person', { key: WRITE, body: { notes: 'edited', max_hours: 12 } });
  check('employee update by name', r.json.ok && r.json.data.employee.max_hours === 12, r.json);
  r = await call('POST', 'shifts', { key: WRITE, body: { employee: 'API Test Person', date: W1, start_time: S1, end_time: E1 } });
  check('shift for new employee', r.status === 201, r.json);
  r = await call('DELETE', `employees/${T.id}`, { key: WRITE });
  check('employee delete needs confirm', r.status === 409 && codes(r)[0] === 'CONFIRM_REQUIRED' && r.json.data.would_also_delete.shifts === 1, r.json);
  r = await call('DELETE', `employees/${T.id}`, { key: WRITE, query: { confirm: 'true' } });
  check('employee delete cascade', r.json.ok && r.json.data.shifts_deleted === 1, r.json);
  const delEmp = r.json.data?.change?.change_id;
  r = await call('POST', `changes/${delEmp}/undo`, { key: WRITE, body: {} });
  const back = await call('GET', 'employees/API Test Person', { key: WRITE });
  check('undo employee delete restores with shift', r.json.ok && back.json.ok && back.json.data.employee.notes === 'edited', { r: r.json, back: back.json?.message });
  r = await call('GET', 'schedule', { key: WRITE, query: { week: W1, employee: 'API Test Person' } });
  check('restored shift reattached', r.json.ok && r.json.data.summary.shifts === 1, r.json?.data?.summary);
  await call('DELETE', 'employees/API Test Person', { key: WRITE, query: { confirm: 'true' } });

  // ---- settings (real change, then undo) ----
  const origNotes = settings.notes;
  r = await call('PATCH', 'settings', { key: WRITE, body: { notes: 'API TEST settings note' } });
  check('settings update', r.json.ok && r.json.data.settings.notes === 'API TEST settings note', r.json);
  r = await call('POST', `changes/${r.json.data.change.change_id}/undo`, { key: WRITE, body: {} });
  const st = await call('GET', 'settings', { key: WRITE });
  check('settings undo restores', r.json.ok && st.json.data.settings.notes === origNotes, st.json?.data?.settings?.notes);
  r = await call('PATCH', 'settings', { key: WRITE, body: { hours: { monday: { open: '25:00' } } } });
  check('settings bad time', r.status === 400 && codes(r)[0] === 'INVALID_TIME');

  // ---- change log ----
  r = await call('GET', 'changes', { key: WRITE, query: { limit: 5 } });
  check('changes list', r.json.ok && r.json.data.changes.length === 5 && r.json.data.changes[0].at >= r.json.data.changes[4].at, r.json?.message);
  r = await call('GET', `changes/${create1Change}`, { key: WRITE });
  check('change detail', r.json.ok && r.json.data.change.action === 'shift.create', r.json);

  // ---- isolation: another account's key cannot see or touch these rows ----
  // (clear + undo re-created the shifts with new ids, so look up one that exists right now)
  const live = await call('GET', 'schedule', { key: WRITE, query: { week: W1 } });
  const liveShift = live.json.data.days.flatMap((d) => d.shifts)[0];
  check('live shift exists for isolation test', !!liveShift?.id, live.json?.data?.summary);
  r = await call('GET', `shifts/${liveShift.id}`, { key: WRITE });
  check('owner can read it', r.status === 200, r.json);
  r = await call('GET', `shifts/${liveShift.id}`, { key: OTHER });
  check('isolation read 404', r.status === 404, r.json);
  r = await call('PATCH', `shifts/${liveShift.id}`, { key: OTHER, body: { start_time: '11:00' } });
  check('isolation patch 404', r.status === 404, r.json);
  r = await call('DELETE', `shifts/${liveShift.id}`, { key: OTHER });
  check('isolation delete 404', r.status === 404, r.json);
  r = await call('GET', 'schedule', { key: OTHER, query: { week: W1 } });
  check('isolation schedule empty', r.json.ok && r.json.data.summary.shifts === 0, r.json?.data?.summary);
  r = await call('POST', `changes/${create1Change}/undo`, { key: OTHER, body: {} });
  check('isolation undo 404', r.status === 404, r.json);
  s = await call('GET', `shifts/${liveShift.id}`, { key: WRITE });
  check('shift untouched by other account', s.json.ok && s.json.data.shift.start_time === liveShift.start_time && s.json.data.shift.employee_id === liveShift.employee_id, s.json);

  // ---- revoked key ----
  await store.revokeApiKey(sb, sohum.id, readRec.id);
  r = await call('GET', 'me', { key: READ });
  check('revoked key 401', r.status === 401 && codes(r)[0] === 'API_KEY_REVOKED', r.json);
} catch (e) {
  fail++;
  console.log('TEST CRASHED', e.stack);
} finally {
  // ---- cleanup: every row in 2030, test employees, and all API storage for both test accounts ----
  const del = async (table, col) => (await sb.from(table).delete().eq('user_id', sohum.id).gte(col, YEAR[0]).lte(col, YEAR[1]).select('id')).data?.length || 0;
  const removed = { shifts: await del('shifts', 'date'), time_off: await del('time_off', 'start_date'), events: await del('events', 'start_date') };
  const emps = (await sb.from('employees').delete().eq('user_id', sohum.id).eq('name', 'API Test Person').select('id')).data?.length || 0;
  const s = await sb.from('store_settings').select('metadata').eq('user_id', sohum.id).limit(1);
  const strayNotes = Object.keys(s.data?.[0]?.metadata?.week_notes || {}).filter((k) => k.startsWith('2030'));
  async function wipe(prefix) {
    const { data } = await sb.storage.from(store.BUCKET).list(prefix, { limit: 1000 });
    let n = 0;
    for (const o of data || []) {
      const full = `${prefix}/${o.name}`;
      if (o.id === null) n += await wipe(full);
      else { await sb.storage.from(store.BUCKET).remove([full]); n++; }
    }
    return n;
  }
  const files = (await wipe(`users/${sohum.id}`)) + (await wipe(`users/${other.id}`));
  let tokenFiles = 0;
  for (const k of [WRITE, READ, OTHER]) { await sb.storage.from(store.BUCKET).remove([`tokens/${store.sha256(k)}.json`]); tokenFiles++; }
  console.log('cleanup:', JSON.stringify({ ...removed, employees: emps, stray_2030_notes: strayNotes, storage_files: files, token_files: tokenFiles }));
  console.log(`\nRESULT: ${pass} passed, ${fail} failed${failures.length ? ` -> ${failures.join(' | ')}` : ''}`);
  process.exit(fail ? 1 : 0);
}
