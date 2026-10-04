// The API documentation, as Markdown. One source for both places it is shown:
//   /api-docs        the page on the website (rendered)
//   /api/v1/docs     raw Markdown for AI assistants such as Muse (no JavaScript needed)
// Keep it in sync with api/_lib (endpoints, limits, error codes).

export function buildApiDocs(site = "https://shift-schedule-website.vercel.app") {
  const API = `${site}/api/v1`;
  return `# Shift Schedule API (version 1)

Read and change the restaurant's staff schedule from an AI assistant (like Muse) or any program.
Everything the website shows is available: shifts, employees, time off, events, week notes and store
settings. Changes follow exactly the same rules as the website.

- Base URL: \`${API}\`
- This page as raw Markdown (best for AI assistants): \`${API}/docs\`
- OpenAPI 3.1 spec: \`${API}/openapi.json\`
- Human friendly page: \`${site}/api-docs\`

## Quick start (connecting Muse)

1. On the website, open **Settings > API access** and create a key. Choose "Read and write" if Muse
   should be able to make changes. Copy the key right away: it starts with \`sk_shift_\` and is shown
   only once.
2. In the Muse app, ask Muse to create a **custom connector** for this API. Give it this docs URL:
   \`${API}/docs\`, and paste the key when Muse asks for it. Tell Muse to send it as the header
   \`Authorization: Bearer <key>\`.
3. Ask Muse to call \`GET /me\` to check the connection. It should answer with the store name and today's date.

Anything the key can do can be undone (see Undo), and keys can be revoked in one click in Settings.

## Authentication

Send the key on every request in a header:

\`\`\`
Authorization: Bearer sk_shift_xxxxxxxxxxxxxxxx
\`\`\`

\`X-API-Key: sk_shift_...\` also works. **Never put the key in the URL**: the API refuses it there
(error \`API_KEY_IN_URL\`) because URLs end up in logs and history.

Keys are either **read only** (can only read) or **read and write**. A read only key gets
\`FORBIDDEN_SCOPE\` on any change. Keys belong to one account and only ever see that account's data.

## Conventions

- **Time zone:** America/Chicago (Champaign). "Today" means today there. Every response includes
  \`meta.today\`.
- **Dates:** \`YYYY-MM-DD\`. You may also send \`today\`, \`tomorrow\` or \`yesterday\`.
- **Times:** 24 hour \`HH:MM\` (\`"17:00"\` is 5 PM). \`"5pm"\`, \`"5:30 PM"\`, \`"noon"\` and
  \`"midnight"\` are accepted too. Minutes must be :00, :15, :30 or :45, the same steps the website uses.
- **Shifts past midnight:** a shift belongs to the date it starts. If \`end_time\` is at or before
  \`start_time\` it ends the next day. Example: \`"date": "2026-10-09", "start_time": "18:00",
  "end_time": "02:00"\` is Friday 6 PM to Saturday 2 AM. Do not split it into two shifts.
- **Weeks** run Monday to Sunday. Week notes are keyed by the week's Monday.
- **Employees** can be given by id or by name. Names match exactly, then by first name, then by the
  start of the name. If a name matches more than one person you get \`AMBIGUOUS_EMPLOYEE\` with the
  candidates; use the full name or the id.
- **Tentative shifts** are backup shifts: shown as an outline on the website and **not counted** in
  hours.
- **Hours** are counted per employee per week (Monday to Sunday), tentative shifts excluded, and
  compared with each employee's \`min_hours\` and \`max_hours\`.

## Every response looks the same

\`\`\`json
{
  "ok": true,
  "status": 201,
  "action": "shift.create",
  "message": "Added Arpit Patel: Sat, Oct 10 2026, 5:00 PM to 11:00 PM, 6h. Arpit Patel now has 32 counted hours that week (max 40).",
  "data": { "shift": { }, "day": { }, "employee_week": { }, "change": { "change_id": "chg_...", "undo": "POST /changes/chg_.../undo" } },
  "warnings": [],
  "errors": [],
  "meta": { "request_id": "req_...", "api_version": "1", "timezone": "America/Chicago", "today": "2026-10-04", "generated_at": "...", "docs": "${API}/docs" }
}
\`\`\`

- \`ok\`: true if the request did what was asked.
- \`message\`: a plain English summary you can read back to the user.
- \`data\`: the result. **Every change also returns how the affected day and the employee's week look
  afterwards**, so you can check the change makes sense.
- \`warnings\`: things worth knowing that did not stop the request (for example the employee is
  marked unavailable). Each has \`code\`, \`message\`, and often \`hint\` and \`details\`.
- \`errors\`: why a request was refused. Each has \`code\`, \`message\`, \`hint\` (how to fix it) and
  often \`details\` (for example the conflicting shift). Fix the problem and send again, or tell the user.
- HTTP status codes are meaningful (200, 201, 207, 400, 401, 403, 404, 409, 422, 500), but the body
  always explains them.

## The scheduling rules (same as the website)

A shift is **refused** when:
- \`OUTSIDE_STORE_HOURS\`: it is not inside that day's store hours (overnight hours handled; a shift
  can end after midnight when the store closes after midnight).
- \`SHIFT_CONFLICT\`: the same employee already has an overlapping shift that day.
- \`PAST_DATE_NOT_CONFIRMED\`: it is on a past date and \`"confirm_past": true\` was not sent (the website
  asks "Are you sure?" for past days).

A shift is **allowed with a warning** when:
- \`EMPLOYEE_UNAVAILABLE\`: the employee is marked unavailable then.
- \`TIME_OFF_THAT_DAY\`: the employee has time off that day.
- \`OVER_MAX_HOURS\` / \`AT_MAX_HOURS\`: it takes them over, or to, their weekly max.
- \`NO_STORE_HOURS\`: that weekday has no store hours set, so hours were not checked.

## Safety features

- **Dry run:** add \`"dry_run": true\` to any change (or \`?dry_run=true\`). The API checks
  everything and shows exactly what would happen, including the day and week afterwards, but saves nothing.
- **Change log and undo:** every change made through the API is logged. \`GET /changes\` lists them and
  \`POST /changes/{id}/undo\` reverses one (an undo can itself be undone). Undo refuses with
  \`CHANGED_SINCE\` if someone edited the same things again afterwards, unless you send \`"force": true\`.
- **Safe retries:** send an \`Idempotency-Key\` header (any unique string) with a change. If the same
  request is sent again with the same key within 24 hours, the API returns the first result instead of
  doing it twice. Reusing a key for a different request gives \`IDEMPOTENCY_KEY_REUSED\`.
- **Confirmations:** clearing days and deleting an employee need \`"confirm": true\`, like the website's
  confirmation dialogs.

## Limits

- \`GET /schedule\`: up to 93 days per request.
- Lists (\`/shifts\`, \`/time-off\`, \`/events\`): up to 366 days per request when you give dates, or all
  time when you do not; 200 items per page by default, up to 1000 with \`limit\`. Use \`offset\` and
  \`data.page.next_offset\` to get the rest.
- Batch create: up to 100 shifts. Clear: up to 31 days. Time off: up to 62 days per request.
- Week notes: up to 2000 characters (the website's limit).

## Endpoints

All paths are relative to \`${API}\`. Query parameters go in the URL; bodies are JSON.

### Account and settings

**GET /me**: checks the key works. Returns the store, the account, the key's access, today's date
and time in Champaign, this week's dates, and the limits.

**GET /settings**: store name, manager, notes, opening hours for each day (with \`closes_next_day\`),
and the employee display order.

**PATCH /settings**: change any of \`store_name\`, \`manager_name\`, \`notes\`, \`hours\`,
\`employee_order\`.
\`\`\`json
{ "hours": { "friday": { "open": "08:00", "close": "05:00" }, "monday": null }, "employee_order": ["Arpit Patel", "Harsha"] }
\`\`\`

### Reading the schedule

**GET /schedule**: the main read. Everything for a range of days, grouped by day.

Pick the range with ONE of:
- \`preset\`: \`today\`, \`tomorrow\`, \`yesterday\`, \`this_week\`, \`next_week\`, \`last_week\`,
  \`this_month\`, \`next_month\`, \`last_month\`
- \`date\`: one day
- \`week\`: any date in a week (Monday to Sunday)
- \`start\` and \`end\`: any range up to 93 days
- nothing: this week

Filters (optional): \`employee\` (names or ids, comma separated), \`title\` (for example \`cook\`),
\`tentative\` (\`true\` for backup shifts only, \`false\` for confirmed only), \`include\` (comma
separated parts to return: \`shifts,time_off,events,notes,totals\`; default all).

Returns \`data.days[]\` (each with store hours, shifts, time off, events, counts), \`data.totals\`
(hours per employee per week with min/max status), \`data.notes\` (week notes), \`data.summary\`, and
\`data.employees\` (ids and names).

Examples:
\`\`\`
GET /schedule?preset=tomorrow
GET /schedule?week=2026-10-12&employee=Arpit
GET /schedule?start=2026-10-01&end=2026-10-31&title=cook
GET /schedule?preset=next_week&tentative=true
\`\`\`

**GET /availability**: who can work a slot. Query: \`date\`, \`start_time\`, \`end_time\`, optional
\`title\`. Each employee gets \`status\`: \`free\`, \`possible_with_warnings\` (time off, marked
unavailable, or over max hours) or \`busy\` (already working), with reasons and their weekly hours.
Sorted with free people with the fewest hours first.
\`\`\`
GET /availability?date=2026-10-10&start_time=17:00&end_time=23:00&title=cook
\`\`\`

**GET /shifts**: a flat, paged list. Query: any range option above (or none for all time),
\`employee\`, \`title\`, \`tentative\`, \`limit\`, \`offset\`, \`order\` (\`asc\` or \`desc\` by date).
**GET /shifts/{id}**: one shift with its day and the employee's week.

**GET /employees**: everyone in the website's display order, with this week's hours (\`week\` to pick
another week). Filters: \`q\` (name contains), \`title\`, \`food_safety_certified\`.
**GET /employees/{id or name}**: one employee with their week (\`week\` optional) and time off in the
next 60 days.

**GET /time-off**: paged list. Query: range options, \`employee\`, \`type\` (\`regular_off\` or
\`custom_time_off\`), \`full_day\`, \`limit\`, \`offset\`. **GET /time-off/{id}**.

**GET /events**: paged list of events overlapping a range. **GET /events/{id}**.

**GET /notes**: week notes. \`week\` (any date in the week), or a range, or nothing for all.
**GET /notes/{week}**: one week's note.

### Changing shifts

**POST /shifts**: add one shift.
\`\`\`json
{ "employee": "Arpit", "date": "2026-10-10", "start_time": "17:00", "end_time": "23:00", "tentative": false }
\`\`\`
Optional: \`confirm_past\`, \`dry_run\`. Returns the new shift, the whole day, and the employee's week.

**POST /shifts/batch**: add up to 100 shifts at once. Each shift is checked against the schedule and
against the other shifts in the batch. By default it is all or nothing (\`"atomic": true\`): if any
shift has a problem, none are added and \`data.results\` says which and why. With \`"atomic": false\`
the good ones are added and the rest reported (status 207).
\`\`\`json
{ "shifts": [ { "employee": "Arpit", "date": "2026-10-12", "start_time": "17:00", "end_time": "23:00" },
              { "employee": "Harsha", "date": "2026-10-12", "start_time": "11:00", "end_time": "17:00" } ],
  "dry_run": true }
\`\`\`

**PATCH /shifts/{id}**: change any of \`employee\`, \`date\`, \`start_time\`, \`end_time\`,
\`tentative\`. Returns before and after, plus the affected days and weeks.

**DELETE /shifts/{id}**: remove a shift (\`?confirm_past=true\` for past dates).

**POST /shifts/clear**: remove all shifts (and regular days off, like the website) for a day, week or
range up to 31 days. Body: \`date\` or \`week\` or \`start\`/\`end\`; optional \`employee\`,
\`include_regular_off\` (default true); requires \`"confirm": true\`.

**POST /schedule/copy-week**: like the website's "Copy previous week".
\`\`\`json
{ "to_week": "2026-10-12" }
\`\`\`
Copies the week before \`to_week\` into it, replacing what is there. Options: \`from_week\` (copy a
different week), \`"replace": false\` (keep existing shifts, skip overlapping copies), \`include_time_off\`
(regular days off, default true), \`employee\`, \`dry_run\`.

**POST /schedule/copy-day**: like "Copy previous day". \`{ "to_date": "2026-10-10" }\`, optional
\`from_date\`, \`replace\`, \`employee\`.

### Changing time off, events, employees, notes

**POST /time-off**: \`employee\`, \`date\` (or \`start_date\` and \`end_date\` for several days, one entry
per day), \`type\` (\`regular_off\` default, or \`custom_time_off\`), \`full_day\` (default true; otherwise
\`start_time\` and \`end_time\`), \`reason\`. Warns if they are already scheduled then.
**PATCH /time-off/{id}**, **DELETE /time-off/{id}**.

**POST /events**: \`name\`, \`start_date\`, optional \`end_date\`, \`all_day\` (default true),
\`start_time\`, \`end_time\`, \`notes\`, \`color\` (hex). **PATCH /events/{id}**, **DELETE /events/{id}**.

**POST /employees**: \`name\`, \`title\` and \`min_hours\` are required (as on the website); optional
\`max_hours\`, \`available_hours\` (free text), \`unavailable_hours\` (list of
\`{"day": "Saturday", "start_time": "00:00", "end_time": "23:59"}\`), \`food_safety_certified\`,
\`notes\`, \`color\`.
**PATCH /employees/{id or name}**: change any of those fields.
**DELETE /employees/{id or name}**: requires \`"confirm": true\`. Also deletes all their shifts and time
off, like the website. Undo restores everything.

**PUT /notes/{week}**: \`{ "text": "..." }\` sets the note for the week containing that date.
\`"append": true\` adds a new line to the existing note instead of replacing it.
**DELETE /notes/{week}**.

### Change log and undo

**GET /changes**: changes made through the API, newest first (\`limit\`, \`offset\`). Changes made on
the website itself are not included.
**GET /changes/latest**: just the newest change id and time (cheap; good for polling).
**GET /changes/{id}**: one change with before and after.
**POST /changes/{id}/undo**: reverse it. Optional \`"force": true\`, \`"dry_run": true\`.

## Recipes

- "What is my schedule tomorrow?" \`GET /schedule?preset=tomorrow\`, then read \`message\` and
  \`data.days[0].shifts\`.
- "Who works Saturday night?" \`GET /schedule?date=YYYY-MM-DD\` and look at shifts that end after 6 PM.
- "Who can cover 5 to 11 on Saturday?" \`GET /availability?date=...&start_time=17:00&end_time=23:00\`.
- "Put Arpit on Saturday 5 to 11." \`POST /shifts\`. If you get \`SHIFT_CONFLICT\`, the error shows the
  existing shift; offer to move it with \`PATCH /shifts/{id}\`.
- "Move Harsha's Friday shift to Saturday." Find it with
  \`GET /schedule?week=...&employee=Harsha\`, then \`PATCH /shifts/{id}\` with the new \`date\`.
- "Make next week like this week." \`POST /schedule/copy-week\` with \`to_week\` = next Monday. Try
  \`"dry_run": true\` first and show the summary.
- "How many hours does everyone have this week?" \`GET /employees\` (\`week_hours\`) or the totals in
  \`GET /schedule\`.
- "Undo that." \`GET /changes?limit=5\`, then \`POST /changes/{id}/undo\`.
- Draft a whole week: build it, send \`POST /shifts/batch\` with \`"dry_run": true\`, show the user the
  result, and send it again without \`dry_run\` once they agree.

## Error codes

Authentication: \`AUTH_REQUIRED\`, \`INVALID_API_KEY\`, \`API_KEY_REVOKED\`, \`API_KEY_IN_URL\`,
\`INVALID_SESSION\`, \`FORBIDDEN_SCOPE\`, \`SESSION_REQUIRED\`.

Input: \`INVALID_JSON\`, \`MISSING_FIELD\`, \`INVALID_DATE\`, \`INVALID_TIME\`,
\`TIME_NOT_ON_QUARTER_HOUR\`, \`INVALID_VALUE\`, \`END_BEFORE_START\`, \`RANGE_TOO_LARGE\`,
\`BATCH_TOO_LARGE\`, \`NOTE_TOO_LONG\`, \`EMPLOYEE_NOT_FOUND\`, \`AMBIGUOUS_EMPLOYEE\`, \`NOT_FOUND\`,
\`ROUTE_NOT_FOUND\`, \`METHOD_NOT_ALLOWED\`.

Rules: \`OUTSIDE_STORE_HOURS\`, \`SHIFT_CONFLICT\`, \`PAST_DATE_NOT_CONFIRMED\`, \`CONFIRM_REQUIRED\`,
\`NO_STORE_SETTINGS\`.

Undo and retries: \`ALREADY_UNDONE\`, \`CHANGED_SINCE\`, \`UNDO_NOT_POSSIBLE\`,
\`IDEMPOTENCY_KEY_REUSED\`.

Server: \`DATABASE_ERROR\`, \`INTERNAL_ERROR\` (safe to retry once; include \`meta.request_id\` when
reporting).

Warning codes: \`EMPLOYEE_UNAVAILABLE\`, \`TIME_OFF_THAT_DAY\`, \`OVER_MAX_HOURS\`, \`AT_MAX_HOURS\`,
\`NO_STORE_HOURS\`, \`SHIFT_DURING_TIME_OFF\`, \`DUPLICATE_TIME_OFF\`, \`DUPLICATE_EMPLOYEE_NAME\`,
\`PAST_DATE\`, \`PAST_DATES_IN_TARGET\`, \`SKIPPED_CONFLICT\`, \`COPIED_SHIFT_OUTSIDE_STORE_HOURS\`,
\`SOME_SHIFTS_SKIPPED\`, \`EMPLOYEES_NOT_IN_ORDER\`, \`UNKNOWN_FIELD\`, \`ROWS_ALREADY_GONE\`,
\`CHANGE_NOT_LOGGED\`.
`;
}
