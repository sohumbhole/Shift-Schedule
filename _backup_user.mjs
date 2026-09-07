// READ-ONLY per-user (or all-user) Supabase backup. No Docker, no DB password.
// Reads the LIVE schema every run (never trusts the migration file) and backs up
// every table that has a user_id column, using SELECT * so column drift is captured.
//
// Usage:
//   node _backup_user.mjs someone@example.com            # one user by email
//   node _backup_user.mjs <user-uuid>                     # one user by UUID
//   node _backup_user.mjs --all                           # every user
//
// Secrets come from .env.local and are never printed. Output goes OUTSIDE the repo.

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

// ---- load secrets from .env.local (never logged) ----
const env = {};
for (const line of fs.readFileSync(path.resolve('.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const URL = env.VITE_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local'); process.exit(1); }

const arg = process.argv[2];
if (!arg) { console.error('Usage: node _backup_user.mjs <email | user-uuid | --all>'); process.exit(1); }

const supabase = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

// ---- 1. discover LIVE schema: which tables have a user_id column ----
async function discoverUserTables() {
  const res = await fetch(`${URL}/rest/v1/`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  const spec = await res.json();
  const defs = spec.definitions || spec.components?.schemas || {};
  const withUserId = [], withoutUserId = [];
  for (const [table, def] of Object.entries(defs)) {
    const cols = Object.keys(def.properties || {});
    (cols.includes('user_id') ? withUserId : withoutUserId).push(table);
  }
  return { withUserId, withoutUserId };
}

// ---- 2. resolve which user(s) to back up ----
async function listAllUsers() {
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return users;
}

async function resolveTargets() {
  if (arg === '--all') return (await listAllUsers()).map(u => ({ id: u.id, email: u.email, user: u }));
  if (isUuid(arg)) {
    const { data, error } = await supabase.auth.admin.getUserById(arg);
    if (error) throw error;
    return [{ id: arg, email: data.user?.email, user: data.user }];
  }
  const match = (await listAllUsers()).find(u => (u.email || '').toLowerCase() === arg.toLowerCase());
  if (!match) { console.error(`No auth user found with email ${arg}`); process.exit(1); }
  return [{ id: match.id, email: match.email, user: match }];
}

// ---- 3. back up one user across all discovered tables ----
async function backupUser(target, tables, rootDir) {
  const safeEmail = (target.email || target.id).replace(/[^a-z0-9._@-]/gi, '_');
  const dir = path.join(rootDir, safeEmail);
  fs.mkdirSync(dir, { recursive: true });
  const summary = { user_id: target.id, email: target.email, tables: {} };

  fs.writeFileSync(path.join(dir, 'auth_user.json'), JSON.stringify(target.user, null, 2));

  for (const t of tables) {
    const { data, error } = await supabase.from(t).select('*').eq('user_id', target.id);
    if (error) { summary.tables[t] = { saved: false, error: error.message }; console.log(`  ${t}: ERROR ${error.message}`); continue; }
    fs.writeFileSync(path.join(dir, `${t}.json`), JSON.stringify(data, null, 2));
    summary.tables[t] = { rows: data.length, saved: true };
    console.log(`  ${t.padEnd(20)}: ${data.length} rows`);
  }
  return summary;
}

// ---- main ----
const { withUserId, withoutUserId } = await discoverUserTables();
console.log('Live tables WITH user_id (will back up):', withUserId.join(', '));
if (withoutUserId.length) console.log('Tables WITHOUT user_id (skipped - review manually if new):', withoutUserId.join(', '));

const targets = await resolveTargets();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
// Output base: BACKUP_OUT_DIR env var if set (used by the scheduled task), else the parent of the repo.
const outBase = process.env.BACKUP_OUT_DIR ? path.resolve(process.env.BACKUP_OUT_DIR) : path.resolve('..');
const rootDir = path.join(outBase, `backup-${stamp}`);
fs.mkdirSync(rootDir, { recursive: true });

const manifest = { created_at: new Date().toISOString(), supabase_url: URL, tables_backed_up: withUserId, tables_skipped_no_user_id: withoutUserId, users: [] };
for (const target of targets) {
  console.log(`\nUser: ${target.email} (${target.id})`);
  manifest.users.push(await backupUser(target, withUserId, rootDir));
}
fs.writeFileSync(path.join(rootDir, '_manifest.json'), JSON.stringify(manifest, null, 2));
console.log('\nBackup folder:', rootDir);
