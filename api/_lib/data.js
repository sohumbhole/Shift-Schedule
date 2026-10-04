// Database access for /api/v1. The server uses the service role key (which bypasses row level
// security), so EVERY query here is pinned to one account with .eq('user_id', userId) and every
// insert sets user_id. Do not add a query that skips that filter.
import { ApiError } from './http.js';
import { isUuid } from './parse.js';

const PAGE = 1000;
const CHUNK = 200;

function fail(error, what) {
  if (error) {
    throw new ApiError(500, 'DATABASE_ERROR', `The database returned an error while ${what}: ${error.message}`, {
      hint: 'Try again in a moment. If it keeps failing, the details below help Sohum debug it.',
      details: { db_code: error.code || null },
    });
  }
}

export function scopedDb(sb, userId) {
  async function fetchAll(table, build, orders) {
    const out = [];
    for (let from = 0; ; from += PAGE) {
      let q = sb.from(table).select('*').eq('user_id', userId);
      q = build ? build(q) : q;
      for (const [col, asc] of orders) q = q.order(col, { ascending: asc });
      const { data, error } = await q.range(from, from + PAGE - 1);
      fail(error, `reading ${table}`);
      out.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
    return out;
  }

  async function page(table, build, orders, limit, offset) {
    let q = sb.from(table).select('*', { count: 'exact' }).eq('user_id', userId);
    q = build ? build(q) : q;
    for (const [col, asc] of orders) q = q.order(col, { ascending: asc });
    const { data, error, count } = await q.range(offset, offset + limit - 1);
    fail(error, `reading ${table}`);
    return { rows: data || [], total: count ?? (data || []).length };
  }

  const shiftFilter = ({ start, end, employeeIds, tentative }) => (q) => {
    if (start) q = q.gte('date', start);
    if (end) q = q.lte('date', end);
    if (employeeIds && employeeIds.length) q = q.in('employee_id', employeeIds);
    if (tentative === true) q = q.eq('tentative', true);
    if (tentative === false) q = q.eq('tentative', false);
    return q;
  };

  const timeOffFilter = ({ start, end, employeeIds, type, fullDay }) => (q) => {
    if (start) q = q.gte('start_date', start);
    if (end) q = q.lte('start_date', end);
    if (employeeIds && employeeIds.length) q = q.in('employee_id', employeeIds);
    if (type) q = q.eq('type', type);
    if (fullDay === true) q = q.eq('full_day', true);
    if (fullDay === false) q = q.eq('full_day', false);
    return q;
  };

  const eventFilter = ({ start, end }) => (q) => {
    if (end) q = q.lte('start_date', end);
    if (start) q = q.or(`end_date.gte.${start},and(end_date.is.null,start_date.gte.${start})`);
    return q;
  };

  return {
    userId,

    employees: () => fetchAll('employees', null, [['created_at', true]]),

    async settings() {
      const { data, error } = await sb.from('store_settings').select('*').eq('user_id', userId).limit(1);
      fail(error, 'reading store settings');
      return data && data[0] ? data[0] : null;
    },

    shifts: (opts) => fetchAll('shifts', shiftFilter(opts), [['date', true], ['start_time', true]]),
    shiftsPage: (opts, limit, offset, asc = true) =>
      page('shifts', shiftFilter(opts), [['date', asc], ['start_time', asc]], limit, offset),

    timeOff: (opts) => fetchAll('time_off', timeOffFilter(opts), [['start_date', true], ['start_time', true]]),
    timeOffPage: (opts, limit, offset, asc = true) =>
      page('time_off', timeOffFilter(opts), [['start_date', asc], ['start_time', asc]], limit, offset),

    events: (opts) => fetchAll('events', eventFilter(opts), [['start_date', true]]),
    eventsPage: (opts, limit, offset, asc = true) =>
      page('events', eventFilter(opts), [['start_date', asc]], limit, offset),

    async getById(table, id) {
      if (!isUuid(id)) return null;
      const { data, error } = await sb.from(table).select('*').eq('user_id', userId).eq('id', id).limit(1);
      fail(error, `reading ${table}`);
      return data && data[0] ? data[0] : null;
    },

    async getByIds(table, ids) {
      const valid = ids.filter(isUuid);
      const out = [];
      for (let i = 0; i < valid.length; i += CHUNK) {
        const { data, error } = await sb.from(table).select('*').eq('user_id', userId).in('id', valid.slice(i, i + CHUNK));
        fail(error, `reading ${table}`);
        out.push(...(data || []));
      }
      return out;
    },

    async insert(table, rows) {
      if (!rows.length) return [];
      const clean = rows.map(({ id: _id, created_at: _c, created_date: _cd, ...rest }) => ({ ...rest, user_id: userId }));
      const { data, error } = await sb.from(table).insert(clean).select();
      fail(error, `saving to ${table}`);
      return data || [];
    },

    async update(table, id, values) {
      const { id: _id, user_id: _u, created_at: _c, ...clean } = values;
      const { data, error } = await sb.from(table).update(clean).eq('user_id', userId).eq('id', id).select();
      fail(error, `updating ${table}`);
      return data && data[0] ? data[0] : null;
    },

    async remove(table, ids) {
      let removed = 0;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        const { data, error } = await sb.from(table).delete().eq('user_id', userId).in('id', slice).select('id');
        fail(error, `deleting from ${table}`);
        removed += (data || []).length;
      }
      return removed;
    },

    async updateSettings(id, values) {
      const { data, error } = await sb.from('store_settings').update(values).eq('user_id', userId).eq('id', id).select();
      fail(error, 'updating store settings');
      return data && data[0] ? data[0] : null;
    },

    async createSettings(values) {
      const { data, error } = await sb.from('store_settings').insert({ metadata: {}, ...values, user_id: userId }).select();
      fail(error, 'creating store settings');
      return data && data[0] ? data[0] : null;
    },
  };
}
