// Calls the site's own /api/v1 with the signed in Supabase session (used by Settings > API access
// and by the live refresh check). Muse and other tools use API keys instead.
import { supabase } from "@/lib/supabaseClient";

export class ApiCallError extends Error {
  constructor(envelope, status) {
    super(envelope?.message || `Request failed (${status})`);
    this.envelope = envelope;
    this.status = status;
  }
}

export async function apiFetch(path, { method = "GET", body } = {}) {
  if (!supabase) throw new Error("The database is not configured (mock mode), so the API is unavailable.");
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("You are signed out. Sign in again to manage API access.");
  const res = await fetch(`/api/v1/${path.replace(/^\/+/, "")}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let envelope = null;
  try {
    envelope = await res.json();
  } catch {
    throw new ApiCallError({ message: `The API returned an unexpected response (${res.status}).` }, res.status);
  }
  if (!res.ok || envelope?.ok === false) throw new ApiCallError(envelope, res.status);
  return envelope;
}
