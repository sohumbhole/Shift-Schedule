// OpenAPI 3.1 description of /api/v1, served at /api/v1/openapi.json.
import { API_BASE, SITE_URL } from './http.js';

const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const bool = (description) => ({ type: 'boolean', description });
const int = (description, extra = {}) => ({ type: 'integer', description, ...extra });
const q = (name, description, schema = { type: 'string' }, required = false) => ({ name, in: 'query', required, description, schema });
const p = (name, description) => ({ name, in: 'path', required: true, description, schema: { type: 'string' } });
const body = (properties, required = [], example = undefined) => ({
  required: true,
  content: { 'application/json': { schema: { type: 'object', properties, required }, ...(example ? { example } : {}) } },
});

const RANGE = [
  q('preset', 'today, tomorrow, yesterday, this_week, next_week, last_week, this_month, next_month, last_month', { type: 'string', enum: ['today', 'tomorrow', 'yesterday', 'this_week', 'next_week', 'last_week', 'this_month', 'next_month', 'last_month'] }),
  q('date', 'A single day, YYYY-MM-DD (or today/tomorrow/yesterday)'),
  q('week', 'Any date in a Monday to Sunday week'),
  q('start', 'Range start, YYYY-MM-DD'),
  q('end', 'Range end, YYYY-MM-DD'),
];
const PAGE = [
  q('limit', 'Items per page (default 200, max 1000)', { type: 'integer', minimum: 1, maximum: 1000 }),
  q('offset', 'Items to skip (use data.page.next_offset)', { type: 'integer', minimum: 0 }),
  q('order', 'asc or desc by date', { type: 'string', enum: ['asc', 'desc'] }),
];
const EMP_FILTER = [
  q('employee', 'Employee names or ids, comma separated'),
  q('title', 'Only employees whose title contains this, e.g. cook'),
];
const DRY = { dry_run: bool('Check everything and show the result without saving') };
const PAST = { confirm_past: bool('Required to change anything on a past date') };

const ok = (description) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Envelope' } } },
});
const STD = {
  200: ok('Success. Read message, data and warnings.'),
  400: ok('Bad input. errors[] says which field and how to fix it.'),
  401: ok('Missing, unknown or revoked API key.'),
  403: ok('The key is read only.'),
  404: ok('Not found.'),
  409: ok('Refused by a rule (SHIFT_CONFLICT, PAST_DATE_NOT_CONFIRMED, CONFIRM_REQUIRED, CHANGED_SINCE...).'),
  422: ok('Refused by a rule (OUTSIDE_STORE_HOURS).'),
};
const op = (summary, description, extra = {}) => ({ summary, description, responses: STD, ...extra });

const SHIFT_PROPS = {
  employee: str('Employee name or id'),
  date: str('YYYY-MM-DD, today or tomorrow'),
  start_time: str('HH:MM 24 hour, quarter hours only, e.g. 17:00'),
  end_time: str('HH:MM; at or before start_time means it ends the next day'),
  tentative: bool('Backup shift, not counted toward hours (default false)'),
  ...PAST,
  ...DRY,
};

export function buildOpenApi() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Shift Schedule API',
      version: '1',
      description: `Read and change the restaurant staff schedule (shifts, employees, time off, events, week notes, store settings) with the same rules as the website. Full guide with examples: ${API_BASE}/docs (Markdown) or ${SITE_URL}/api-docs. Every response uses the Envelope shape: ok, status, action, message, data, warnings, errors, meta. Times are America/Chicago.`,
    },
    servers: [{ url: API_BASE }],
    security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', description: 'Authorization: Bearer sk_shift_... (create the key in Settings > API access on the website)' },
        apiKeyHeader: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
      },
      schemas: {
        Problem: {
          type: 'object',
          properties: { code: str('Stable machine code'), message: str('Plain English explanation'), hint: str('How to fix it'), field: str('Which input field'), details: { type: 'object' } },
          required: ['code', 'message'],
        },
        Envelope: {
          type: 'object',
          properties: {
            ok: bool('True when the request did what was asked'),
            status: int('HTTP status'),
            action: str('What was attempted, e.g. shift.create'),
            message: str('Plain English summary to read back to the user'),
            data: { description: 'The result; writes include the affected day(s) and employee week(s)' },
            warnings: { type: 'array', items: { $ref: '#/components/schemas/Problem' } },
            errors: { type: 'array', items: { $ref: '#/components/schemas/Problem' } },
            meta: { type: 'object', properties: { request_id: str(''), api_version: str(''), timezone: str(''), today: str(''), generated_at: str(''), docs: str(''), idempotent_replay: bool('') } },
          },
          required: ['ok', 'status', 'action', 'message', 'data', 'warnings', 'errors', 'meta'],
        },
      },
    },
    paths: {
      '/': { get: op('API index', 'Links to docs. No key needed.', { security: [] }) },
      '/docs': { get: op('Docs as Markdown', 'The full guide. No key needed.', { security: [] }) },
      '/me': { get: op('Check the connection', 'Store, account, key access, today and now in Champaign, limits.') },
      '/settings': {
        get: op('Store settings', 'Store name, manager, notes, hours per day, employee order.'),
        patch: op('Change store settings', 'Any of store_name, manager_name, notes, hours, employee_order.', {
          requestBody: body({
            store_name: str(''), manager_name: str(''), notes: str(''),
            hours: { type: 'object', description: 'e.g. {"monday": {"open": "08:00", "close": "02:00"}}; null clears a day' },
            employee_order: { type: 'array', items: { type: 'string' }, description: 'Names or ids, top to bottom' },
            ...DRY,
          }),
        }),
      },
      '/schedule': {
        get: op('Schedule for a range (main read)', 'Everything for up to 93 days grouped by day: store hours, shifts, time off, events, weekly hour totals per employee, week notes.', {
          parameters: [...RANGE, ...EMP_FILTER, q('tentative', 'true = backup shifts only, false = confirmed only'), q('include', 'Comma separated: shifts,time_off,events,notes,totals (default all)')],
        }),
      },
      '/availability': {
        get: op('Who can work a slot', 'Status per employee: free, possible_with_warnings, busy; with reasons and weekly hours.', {
          parameters: [q('date', 'YYYY-MM-DD', { type: 'string' }, true), q('start_time', 'HH:MM', { type: 'string' }, true), q('end_time', 'HH:MM', { type: 'string' }, true), q('title', 'Only employees whose title contains this')],
        }),
      },
      '/shifts': {
        get: op('List shifts (paged)', 'Flat list; leave out dates for all time.', { parameters: [...RANGE, ...EMP_FILTER, q('tentative', 'true or false'), ...PAGE] }),
        post: op('Add a shift', 'Checked against store hours, overlapping shifts and past dates; returns the day and the employee week.', {
          requestBody: body(SHIFT_PROPS, ['employee', 'date', 'start_time', 'end_time'], { employee: 'Arpit', date: '2026-10-10', start_time: '17:00', end_time: '23:00' }),
        }),
      },
      '/shifts/batch': {
        post: op('Add up to 100 shifts', 'All or nothing by default (atomic). Each shift is checked against the schedule and the rest of the batch.', {
          requestBody: body({ shifts: { type: 'array', items: { type: 'object', properties: SHIFT_PROPS } }, atomic: bool('Default true'), ...PAST, ...DRY }, ['shifts']),
        }),
      },
      '/shifts/clear': {
        post: op('Clear shifts for a day, week or range', 'Also removes regular days off (like the website). Needs confirm: true.', {
          requestBody: body({ date: str(''), week: str(''), start: str(''), end: str(''), employee: str('Optional names or ids'), include_regular_off: bool('Default true'), confirm: bool('Required'), ...PAST, ...DRY }, ['confirm']),
        }),
      },
      '/shifts/{id}': {
        get: op('One shift', 'With its day and the employee week.', { parameters: [p('id', 'Shift id')] }),
        patch: op('Change a shift', 'Any of employee, date, start_time, end_time, tentative.', { parameters: [p('id', 'Shift id')], requestBody: body(SHIFT_PROPS) }),
        delete: op('Delete a shift', 'confirm_past=true for past dates.', { parameters: [p('id', 'Shift id'), q('confirm_past', 'true for past dates'), q('dry_run', 'true to preview')] }),
      },
      '/schedule/copy-week': {
        post: op('Copy a week', 'Like the website "Copy previous week": copies from_week (default the week before) into to_week.', {
          requestBody: body({ to_week: str('Any date in the target week'), from_week: str('Any date in the source week'), replace: bool('Default true'), include_time_off: bool('Copy regular days off, default true'), employee: str('Optional'), ...DRY }, ['to_week']),
        }),
      },
      '/schedule/copy-day': {
        post: op('Copy a day', 'Like "Copy previous day".', {
          requestBody: body({ to_date: str('Target day'), from_date: str('Default the day before'), replace: bool('Default true'), include_time_off: bool('Default false'), employee: str('Optional'), ...DRY }, ['to_date']),
        }),
      },
      '/employees': {
        get: op('List employees', 'In website order, with weekly hours.', { parameters: [q('q', 'Name contains'), q('title', 'Title contains'), q('food_safety_certified', 'true or false'), q('week', 'Week for the hours (default this week)')] }),
        post: op('Add an employee', 'name, title and min_hours are required.', {
          requestBody: body({ name: str(''), title: str(''), min_hours: { type: 'number' }, max_hours: { type: 'number' }, available_hours: str('Free text'), unavailable_hours: { type: 'array', items: { type: 'object', properties: { day: str('e.g. Saturday'), start_time: str(''), end_time: str('') } } }, food_safety_certified: bool(''), notes: str(''), color: str('Hex like #3B82F6'), ...DRY }, ['name', 'title', 'min_hours']),
        }),
      },
      '/employees/{id}': {
        get: op('One employee', 'Id or name. With their week and upcoming time off.', { parameters: [p('id', 'Employee id or name'), q('week', 'Any date in the week')] }),
        patch: op('Change an employee', 'Any employee field.', { parameters: [p('id', 'Employee id or name')], requestBody: body({ name: str(''), title: str(''), min_hours: { type: 'number' }, max_hours: { type: 'number' }, available_hours: str(''), unavailable_hours: { type: 'array', items: { type: 'object' } }, food_safety_certified: bool(''), notes: str(''), color: str(''), ...DRY }) }),
        delete: op('Delete an employee', 'Needs confirm=true. Also deletes their shifts and time off (undo restores them).', { parameters: [p('id', 'Employee id or name'), q('confirm', 'Must be true'), q('dry_run', 'true to preview')] }),
      },
      '/time-off': {
        get: op('List time off (paged)', '', { parameters: [...RANGE, ...EMP_FILTER, q('type', 'regular_off or custom_time_off'), q('full_day', 'true or false'), ...PAGE] }),
        post: op('Add time off', 'One entry per day for a range.', { requestBody: body({ employee: str(''), date: str('Or start_date'), start_date: str(''), end_date: str('Optional, up to 62 days'), type: str('regular_off (default) or custom_time_off'), full_day: bool('Default true'), start_time: str('When not full day'), end_time: str('When not full day'), reason: str(''), ...DRY }, ['employee']) }),
      },
      '/time-off/{id}': {
        get: op('One time off entry', '', { parameters: [p('id', 'Time off id')] }),
        patch: op('Change time off', '', { parameters: [p('id', 'Time off id')], requestBody: body({ employee: str(''), date: str(''), type: str(''), full_day: bool(''), start_time: str(''), end_time: str(''), reason: str(''), ...DRY }) }),
        delete: op('Delete time off', '', { parameters: [p('id', 'Time off id'), q('dry_run', 'true to preview')] }),
      },
      '/events': {
        get: op('List events (paged)', 'Events overlapping the range.', { parameters: [...RANGE, ...PAGE] }),
        post: op('Add an event', '', { requestBody: body({ name: str(''), start_date: str(''), end_date: str(''), all_day: bool('Default true'), start_time: str(''), end_time: str(''), notes: str(''), color: str(''), ...DRY }, ['name', 'start_date']) }),
      },
      '/events/{id}': {
        get: op('One event', '', { parameters: [p('id', 'Event id')] }),
        patch: op('Change an event', '', { parameters: [p('id', 'Event id')], requestBody: body({ name: str(''), start_date: str(''), end_date: str(''), all_day: bool(''), start_time: str(''), end_time: str(''), notes: str(''), color: str(''), ...DRY }) }),
        delete: op('Delete an event', '', { parameters: [p('id', 'Event id'), q('dry_run', 'true to preview')] }),
      },
      '/notes': { get: op('Week notes', 'One week (week=), a range, or all.', { parameters: [q('week', 'Any date in the week'), ...RANGE.slice(0, 1), q('start', ''), q('end', '')] }) },
      '/notes/{week}': {
        get: op('One week note', '', { parameters: [p('week', 'Any date in the week')] }),
        put: op('Set a week note', 'Up to 2000 characters. append=true adds a line.', { parameters: [p('week', 'Any date in the week')], requestBody: body({ text: str(''), append: bool('Add to the existing note'), ...DRY }, ['text']) }),
        delete: op('Delete a week note', '', { parameters: [p('week', 'Any date in the week')] }),
      },
      '/changes': { get: op('Change log', 'Changes made through the API, newest first.', { parameters: [q('limit', 'Default 20, max 100', { type: 'integer' }), q('offset', '', { type: 'integer' })] }) },
      '/changes/latest': { get: op('Newest change', 'Id and time only.') },
      '/changes/{id}': { get: op('One change', 'With before and after.', { parameters: [p('id', 'Change id')] }) },
      '/changes/{id}/undo': { post: op('Undo a change', 'Refuses with CHANGED_SINCE if edited again afterwards unless force=true.', { parameters: [p('id', 'Change id')], requestBody: { required: false, content: { 'application/json': { schema: { type: 'object', properties: { force: bool(''), ...DRY } } } } } }) },
    },
  };
}
