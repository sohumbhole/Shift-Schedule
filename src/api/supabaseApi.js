import { supabase } from '@/lib/supabaseClient';

function toAppRow(row) {
  if (!row) return row;
  const { created_at, ...rest } = row;
  const created_date = created_at instanceof Date ? created_at.toISOString() : (created_at ?? new Date().toISOString());
  return { ...rest, created_date };
}

function toAppRows(rows) {
  return (rows || []).map(toAppRow);
}

async function getUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
}

// The live time_off table names its date column start_date. Some callers (copy previous week, the
// undo snapshots for clear day/week and delete employee) still build payloads with `date`, which
// PostgREST rejects (PGRST204), so copy week failed on regular days off. Map it here once.
function toTimeOffRow(payload) {
  if (!payload || !Object.prototype.hasOwnProperty.call(payload, 'date')) return payload;
  const { date, ...rest } = payload;
  return rest.start_date ? rest : { ...rest, start_date: date };
}

function handleResponse({ data, error }) {
  if (error) throw error;
  return data;
}

export const supabaseApi = {
  entities: {
    Employee: {
      list: async () => {
        const { data, error } = await supabase
          .from('employees')
          .select('*')
          .order('created_at', { ascending: true });
        if (error) throw error;
        return toAppRows(data);
      },
      create: async (payload) => {
        const user_id = await getUserId();
        const { data, error } = await supabase
          .from('employees')
          .insert({ ...payload, user_id })
          .select()
          .single();
        if (error) throw error;
        return toAppRow(data);
      },
      update: async (id, payload) => {
        const { data, error } = await supabase
          .from('employees')
          .update(payload)
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return toAppRow(data);
      },
      delete: async (id) => {
        const { error } = await supabase.from('employees').delete().eq('id', id);
        if (error) throw error;
      },
      bulkCreate: async (items) => {
        const user_id = await getUserId();
        const rows = items.map((item) => ({ ...item, user_id }));
        const { data, error } = await supabase.from('employees').insert(rows).select();
        if (error) throw error;
        return toAppRows(data);
      },
    },
    Shift: {
      list: async () => {
        const { data, error } = await supabase
          .from('shifts')
          .select('*')
          .order('date')
          .order('start_time');
        if (error) throw error;
        return toAppRows(data);
      },
      create: async (payload) => {
        const user_id = await getUserId();
        const { data, error } = await supabase
          .from('shifts')
          .insert({ ...payload, user_id })
          .select()
          .single();
        if (error) throw error;
        return toAppRow(data);
      },
      update: async (id, payload) => {
        const { data, error } = await supabase
          .from('shifts')
          .update(payload)
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return toAppRow(data);
      },
      delete: async (id) => {
        const { error } = await supabase.from('shifts').delete().eq('id', id);
        if (error) throw error;
      },
      bulkCreate: async (items) => {
        const user_id = await getUserId();
        const rows = items.map((item) => ({ ...item, user_id }));
        const { data, error } = await supabase.from('shifts').insert(rows).select();
        if (error) throw error;
        return toAppRows(data);
      },
    },
    TimeOff: {
      list: async () => {
        const { data, error } = await supabase
          .from('time_off')
          .select('*')
          .order('start_date');
        if (error) throw error;
        return toAppRows(data);
      },
      create: async (payload) => {
        const user_id = await getUserId();
        const { data, error } = await supabase
          .from('time_off')
          .insert({ ...toTimeOffRow(payload), user_id })
          .select()
          .single();
        if (error) throw error;
        return toAppRow(data);
      },
      update: async (id, payload) => {
        const { data, error } = await supabase
          .from('time_off')
          .update(toTimeOffRow(payload))
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return toAppRow(data);
      },
      delete: async (id) => {
        const { error } = await supabase.from('time_off').delete().eq('id', id);
        if (error) throw error;
      },
      bulkCreate: async (items) => {
        const user_id = await getUserId();
        const rows = items.map((item) => ({ ...toTimeOffRow(item), user_id }));
        const { data, error } = await supabase.from('time_off').insert(rows).select();
        if (error) throw error;
        return toAppRows(data);
      },
    },
    Event: {
      list: async () => {
        const { data, error } = await supabase
          .from('events')
          .select('*')
          .order('start_date', { ascending: true });
        if (error) throw error;
        return toAppRows(data);
      },
      create: async (payload) => {
        const user_id = await getUserId();
        const { data, error } = await supabase
          .from('events')
          .insert({ ...payload, user_id })
          .select()
          .single();
        if (error) throw error;
        return toAppRow(data);
      },
      update: async (id, payload) => {
        const { data, error } = await supabase
          .from('events')
          .update(payload)
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return toAppRow(data);
      },
      delete: async (id) => {
        const { error } = await supabase.from('events').delete().eq('id', id);
        if (error) throw error;
      },
    },
    StoreSettings: {
      list: async () => {
        const { data, error } = await supabase.from('store_settings').select('*');
        if (error) throw error;
        return toAppRows(data);
      },
      create: async (payload) => {
        const user_id = await getUserId();
        // metadata is NOT NULL with no column default - always provide a fallback
        // so callers that don't pass metadata don't get a NOT NULL violation.
        const { data, error } = await supabase
          .from('store_settings')
          .insert({ metadata: {}, ...payload, user_id })
          .select()
          .single();
        if (error) throw error;
        return toAppRow(data);
      },
      update: async (id, payload) => {
        const { data, error } = await supabase
          .from('store_settings')
          .update(payload)
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return toAppRow(data);
      },
    },
  },
  auth: {
    me: async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      if (!user) throw new Error('Not authenticated');
      return {
        id: user.id,
        email: user.email ?? '',
        role: user.user_metadata?.role ?? 'admin',
      };
    },
    logout: async () => {
      await supabase.auth.signOut();
    },
    redirectToLogin: () => {
      window.location.href = '/login';
    },
  },
};

export default supabaseApi;
