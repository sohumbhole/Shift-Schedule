// Fallback for creating an API key without the website (normally: Settings > API access).
// Needs .env.local with the service role key, so it only works on Sohum's machines.
//
// Usage (from the repo root):
//   node scripts/create_api_key.mjs <account email> [key name] [read|read_write]
// Prints the key once. It is stored only as a hash; if lost, revoke it in Settings and make another.
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}
const [email, name = 'Muse', access = 'read_write'] = process.argv.slice(2);
if (!email || !['read', 'read_write'].includes(access)) {
  console.log('Usage: node scripts/create_api_key.mjs <account email> [key name] [read|read_write]');
  process.exit(2);
}
const { createApiKey } = await import('../api/_lib/store.js');
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data } = await sb.auth.admin.listUsers({ perPage: 1000 });
const user = data.users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
if (!user) {
  console.log(`No account with email ${email}.`);
  process.exit(1);
}
const { key, record } = await createApiKey(sb, { userId: user.id, name, scopes: access === 'read' ? ['read'] : ['read', 'write'] });
console.log(`Created "${record.name}" (${access === 'read' ? 'read only' : 'read and write'}) for ${email}.`);
console.log('Copy it now, it will not be shown again:');
console.log(key);
