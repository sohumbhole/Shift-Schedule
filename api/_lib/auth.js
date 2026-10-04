// Who is calling? Either an API key (Muse) or the website's own logged in Supabase session.
import { ApiError, header } from './http.js';
import { KEY_PREFIX, findApiKey, touchApiKey } from './store.js';

const KEY_HELP = 'Send your API key in the header "Authorization: Bearer sk_shift_..." (or "X-API-Key: sk_shift_..."). Create one on the website: Settings > API access.';

export async function authenticate(req, sb, query) {
  for (const k of ['api_key', 'apikey', 'key', 'token', 'access_token']) {
    if (query && query[k]) {
      throw new ApiError(400, 'API_KEY_IN_URL', 'API keys must never be sent in the URL (URLs get saved in logs and history).', {
        hint: `${KEY_HELP} If this key was shared in a URL anywhere, revoke it in Settings and make a new one.`,
      });
    }
  }

  const authz = header(req, 'authorization') || '';
  const viaHeader = header(req, 'x-api-key');
  let raw = viaHeader ? String(viaHeader).trim() : null;
  if (!raw && /^bearer\s+/i.test(authz)) raw = authz.replace(/^bearer\s+/i, '').trim();
  if (!raw) {
    throw new ApiError(401, 'AUTH_REQUIRED', 'This endpoint needs an API key.', { hint: KEY_HELP });
  }

  if (raw.startsWith(KEY_PREFIX)) {
    const record = await findApiKey(sb, raw);
    if (!record) {
      throw new ApiError(401, 'INVALID_API_KEY', 'That API key is not recognized.', {
        hint: 'Check it was copied completely (it is shown only once when created). If it was lost, revoke it and create a new one in Settings > API access.',
      });
    }
    if (record.revoked_at) {
      throw new ApiError(401, 'API_KEY_REVOKED', `The API key "${record.name}" was revoked on ${record.revoked_at.slice(0, 10)}.`, {
        hint: 'Create a new key in Settings > API access.',
      });
    }
    await touchApiKey(sb, record);
    return {
      userId: record.user_id,
      via: 'api_key',
      scopes: record.scopes || ['read'],
      key: { id: record.id, name: record.name, prefix: record.prefix },
    };
  }

  if (raw.startsWith('eyJ')) {
    const { data, error } = await sb.auth.getUser(raw);
    if (error || !data?.user) {
      throw new ApiError(401, 'INVALID_SESSION', 'Your login session has expired or is invalid.', {
        hint: 'Refresh the website and sign in again.',
      });
    }
    return { userId: data.user.id, via: 'session', scopes: ['read', 'write', 'keys'], email: data.user.email };
  }

  throw new ApiError(401, 'INVALID_API_KEY', `API keys start with "${KEY_PREFIX}".`, { hint: KEY_HELP });
}

export function requireScope(auth, scope) {
  if (scope === 'read') return;
  if (scope === 'write' && auth.scopes.includes('write')) return;
  if (scope === 'keys' && auth.scopes.includes('keys')) return;
  if (scope === 'keys') {
    throw new ApiError(403, 'SESSION_REQUIRED', 'API keys can only be managed from the website while signed in.', {
      hint: 'Open the website, then Settings > API access.',
    });
  }
  throw new ApiError(403, 'FORBIDDEN_SCOPE', `This API key ("${auth.key?.name}") is read only, so it cannot make changes.`, {
    hint: 'Create a key with "Read and write" access in Settings > API access.',
  });
}
