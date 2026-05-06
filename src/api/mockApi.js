/**
 * Mock API - in-memory backend for local development.
 * All entity methods return Promises and match the shapes expected by the UI.
 * Replace with a real client (e.g. Supabase) when connecting to a backend.
 */

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const store = {
  employees: [],
  shifts: [],
  timeOffs: [],
  events: [],
  storeSettings: [],
};

function entityMock(name, defaultFields = {}) {
  const list = store[name];
  return {
    list: () => Promise.resolve([...list]),
    create: (data) => {
      const id = uid();
      const created_date = new Date().toISOString();
      const record = { id, ...defaultFields, ...data, created_date };
      list.push(record);
      return Promise.resolve(record);
    },
    update: (id, data) => {
      const i = list.findIndex((r) => r.id === id);
      if (i === -1) return Promise.reject(new Error(`Not found: ${id}`));
      list[i] = { ...list[i], ...data };
      return Promise.resolve(list[i]);
    },
    delete: (id) => {
      const i = list.findIndex((r) => r.id === id);
      if (i === -1) return Promise.reject(new Error(`Not found: ${id}`));
      list.splice(i, 1);
      return Promise.resolve();
    },
    bulkCreate: (items) => {
      const created = items.map((data) => {
        const id = uid();
        const created_date = new Date().toISOString();
        const record = { id, ...defaultFields, ...data, created_date };
        list.push(record);
        return record;
      });
      return Promise.resolve(created);
    },
  };
}

const StoreSettingsApi = {
  list: () => Promise.resolve([...store.storeSettings]),
  create: (data) => {
    const id = uid();
    const created_date = new Date().toISOString();
    const record = { id, ...data, created_date };
    store.storeSettings.push(record);
    return Promise.resolve(record);
  },
  update: (id, data) => {
    const list = store.storeSettings;
    const i = list.findIndex((r) => r.id === id);
    if (i === -1) return Promise.reject(new Error(`Not found: ${id}`));
    list[i] = { ...list[i], ...data };
    return Promise.resolve(list[i]);
  },
  delete: (id) => {
    const list = store.storeSettings;
    const i = list.findIndex((r) => r.id === id);
    if (i === -1) return Promise.reject(new Error(`Not found: ${id}`));
    list.splice(i, 1);
    return Promise.resolve();
  },
};

const EventApi = entityMock("events");
delete EventApi.bulkCreate;

export const mockApi = {
  entities: {
    Employee: entityMock("employees"),
    Shift: entityMock("shifts"),
    TimeOff: entityMock("timeOffs"),
    Event: EventApi,
    StoreSettings: StoreSettingsApi,
  },
  auth: {
    me: () =>
      Promise.resolve({
        id: "mock-user",
        email: "local@example.com",
        role: "admin",
      }),
    logout: () => Promise.resolve(),
    redirectToLogin: () => {},
  },
};

export default mockApi;
