// Private storage for the API: API keys, the change log, and idempotency records.
//
// These live in a private Supabase Storage bucket instead of new database tables (decided
// 2026-10-04: no schema changes, and none of this duplicates data that already lives in a table).
// Only the server, with the service role key, can read or write the bucket.
//
// Layout of bucket "api-private":
//   tokens/<sha256 of key>.json             one per API key (lookup on every request)
//   users/<user_id>/tokens/<key id>.json    index of a user's keys (for the Settings page)
//   users/<user_id>/changes/<change id>.json the change log; ids sort by time
//   users/<user_id>/idem/<sha256 of Idempotency-Key>.json   saved responses for safe retries
import crypto from 'node:crypto';

export const BUCKET = 'api-private';
export const KEY_PREFIX = 'sk_shift_';

let bucketReady = null;

export function ensureBucket(sb) {
  if (!bucketReady) {
    bucketReady = (async () => {
      const { data } = await sb.storage.getBucket(BUCKET);
      if (data) return;
      const { error } = await sb.storage.createBucket(BUCKET, { public: false });
      if (error && !/already exists/i.test(error.message || '')) throw error;
    })().catch((e) => { bucketReady = null; throw e; });
  }
  return bucketReady;
}

// Supabase Storage puts a CDN in front of downloads, and by default objects say max-age=3600, so a
// plain download can return a copy up to an hour old (found 2026-10-04: a revoked key kept working).
// Writes therefore set cacheControl "0", and reads go straight to the storage API with a unique query
// string so they never hit a cached copy.
export async function getJson(sb, path) {
  await ensureBucket(sb);
  const base = process.env.VITE_SUPABASE_URL.replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  const url = `${base}/storage/v1/object/${BUCKET}/${encoded}?nocache=${Date.now()}${crypto.randomBytes(4).toString('hex')}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}`, apikey: key, 'Cache-Control': 'no-cache' }, cache: 'no-store' });
  if (res.ok) return JSON.parse(await res.text());
  const text = await res.text();
  if (res.status === 404 || res.status === 400) {
    if (/not.?found|does not exist|404/i.test(text) || res.status === 404) return null;
  }
  throw new Error(`Storage read failed for ${path}: HTTP ${res.status} ${text.slice(0, 200)}`);
}

export async function putJson(sb, path, obj) {
  await ensureBucket(sb);
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  const { error } = await sb.storage.from(BUCKET).upload(path, body, { contentType: 'application/json', upsert: true, cacheControl: '0' });
  if (error) throw error;
}

export async function listNames(sb, folder, { limit = 100, offset = 0, desc = true } = {}) {
  await ensureBucket(sb);
  const { data, error } = await sb.storage.from(BUCKET).list(folder, {
    limit, offset, sortBy: { column: 'name', order: desc ? 'desc' : 'asc' },
  });
  if (error) throw error;
  return (data || []).filter((o) => o.name && o.name.endsWith('.json')).map((o) => o.name);
}

export function sha256(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

// ---- API keys ----

const tokenCache = new Map(); // hash -> { record, at }

export async function createApiKey(sb, { userId, name, scopes }) {
  const secret = crypto.randomBytes(32).toString('base64url');
  const key = `${KEY_PREFIX}${secret}`;
  const hash = sha256(key);
  const record = {
    id: crypto.randomUUID(),
    user_id: userId,
    name,
    prefix: key.slice(0, KEY_PREFIX.length + 6),
    scopes,
    hash,
    created_at: new Date().toISOString(),
    last_used_at: null,
    revoked_at: null,
  };
  await putJson(sb, `tokens/${hash}.json`, record);
  await putJson(sb, `users/${userId}/tokens/${record.id}.json`, record);
  return { key, record };
}

export async function findApiKey(sb, key) {
  const hash = sha256(key);
  const cached = tokenCache.get(hash);
  if (cached && Date.now() - cached.at < 30000) return cached.record;
  const record = await getJson(sb, `tokens/${hash}.json`);
  if (record) tokenCache.set(hash, { record, at: Date.now() });
  return record;
}

// Records last use at most every 10 minutes, so reads stay fast.
export async function touchApiKey(sb, record) {
  const last = record.last_used_at ? Date.parse(record.last_used_at) : 0;
  if (Date.now() - last < 10 * 60 * 1000) return;
  record.last_used_at = new Date().toISOString();
  try {
    await putJson(sb, `tokens/${record.hash}.json`, record);
  } catch (e) {
    console.warn('touchApiKey failed', e.message);
  }
}

export async function listApiKeys(sb, userId) {
  const names = await listNames(sb, `users/${userId}/tokens`, { limit: 100, desc: false });
  const records = await Promise.all(names.map(async (n) => {
    const idx = await getJson(sb, `users/${userId}/tokens/${n}`);
    if (!idx) return null;
    const live = await getJson(sb, `tokens/${idx.hash}.json`);
    return live || idx;
  }));
  return records.filter(Boolean).sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function revokeApiKey(sb, userId, keyId) {
  const idx = await getJson(sb, `users/${userId}/tokens/${keyId}.json`);
  if (!idx) return null;
  const live = (await getJson(sb, `tokens/${idx.hash}.json`)) || idx;
  if (!live.revoked_at) live.revoked_at = new Date().toISOString();
  await putJson(sb, `tokens/${idx.hash}.json`, live);
  await putJson(sb, `users/${userId}/tokens/${keyId}.json`, { ...idx, revoked_at: live.revoked_at });
  tokenCache.delete(idx.hash);
  return live;
}

// ---- change log ----

export function newChangeId(date = new Date()) {
  const stamp = date.toISOString().replace(/[-:]/g, '').replace('.', '');
  return `chg_${stamp}_${crypto.randomBytes(3).toString('hex')}`;
}

export function changeTime(id) {
  const m = /^chg_(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z_/.exec(id || '');
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.${m[7]}Z` : null;
}

export async function saveChange(sb, userId, change) {
  await putJson(sb, `users/${userId}/changes/${change.id}.json`, change);
}

export async function getChange(sb, userId, id) {
  if (!/^chg_[0-9TZ]+_[0-9a-f]{6}$/.test(id || '')) return null;
  return getJson(sb, `users/${userId}/changes/${id}.json`);
}

export async function listChanges(sb, userId, { limit = 20, offset = 0 } = {}) {
  const names = await listNames(sb, `users/${userId}/changes`, { limit, offset, desc: true });
  const items = await Promise.all(names.map((n) => getJson(sb, `users/${userId}/changes/${n}`)));
  return items.filter(Boolean);
}

export async function latestChangeId(sb, userId) {
  const names = await listNames(sb, `users/${userId}/changes`, { limit: 1, desc: true });
  return names.length ? names[0].replace(/\.json$/, '') : null;
}

// ---- idempotency ----

export async function getIdempotent(sb, userId, key) {
  return getJson(sb, `users/${userId}/idem/${sha256(key)}.json`);
}

export async function saveIdempotent(sb, userId, key, record) {
  await putJson(sb, `users/${userId}/idem/${sha256(key)}.json`, record);
}
