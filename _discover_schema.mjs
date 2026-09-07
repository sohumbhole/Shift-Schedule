// READ-ONLY: dump the LIVE public schema via PostgREST's OpenAPI spec (no DB password needed).
// Lists every exposed table and its columns, and flags which columns look user-scoped.
// Usage: node _discover_schema.mjs
import fs from 'node:fs';
import path from 'node:path';

const env = {};
for (const line of fs.readFileSync(path.resolve('.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const URL = env.VITE_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const res = await fetch(`${URL}/rest/v1/`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
const spec = await res.json();
const defs = spec.definitions || spec.components?.schemas || {};

const USER_COLS = ['user_id','owner_id','profile_id','account_id','customer_id','member_id','created_by','updated_by','author_id','patient_id','provider_id','email'];

console.log('LIVE public tables and their columns:\n');
for (const [table, def] of Object.entries(defs)) {
  const cols = Object.keys(def.properties || {});
  const userScoped = cols.filter(c => USER_COLS.includes(c));
  console.log(`• ${table}`);
  console.log(`    columns: ${cols.join(', ')}`);
  console.log(`    user-scoped col(s): ${userScoped.length ? userScoped.join(', ') : '(none - NOT auto-included in per-user backup!)'}\n`);
}
