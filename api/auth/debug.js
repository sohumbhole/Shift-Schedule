/**
 * DEBUG ENDPOINT - /api/auth/debug
 * Visits this URL to test all environment variables and services.
 * DELETE THIS FILE before going live in production!
 */
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const results = {};

  // 1. Check env vars are present (never log the actual values)
  results.env = {
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ? `✅ Set (${process.env.VITE_SUPABASE_URL})` : '❌ MISSING',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
      ? `✅ Set (length: ${process.env.SUPABASE_SERVICE_ROLE_KEY.length}, starts: ${process.env.SUPABASE_SERVICE_ROLE_KEY.substring(0, 10)}...)`
      : '❌ MISSING',
    VITE_SENDGRID_API_KEY: process.env.VITE_SENDGRID_API_KEY
      ? `✅ Set (length: ${process.env.VITE_SENDGRID_API_KEY.length}, starts: ${process.env.VITE_SENDGRID_API_KEY.substring(0, 10)}...)`
      : '❌ MISSING',
    VITE_APP_BASE_URL: process.env.VITE_APP_BASE_URL ? `✅ Set (${process.env.VITE_APP_BASE_URL})` : '❌ MISSING',
    VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY
      ? `✅ Set (starts: ${process.env.VITE_SUPABASE_ANON_KEY.substring(0, 15)}...)`
      : '❌ MISSING',
  };

  // 2. Test Supabase connection (admin)
  try {
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1 });
    if (error) {
      results.supabase_admin = `❌ FAILED: ${error.message}`;
    } else {
      results.supabase_admin = `✅ Connected OK (found ${data.users.length} users in first page)`;
    }
  } catch (e) {
    results.supabase_admin = `❌ Exception: ${e.message}`;
  }

  // 3. Test Supabase DB (verification_tokens table)
  try {
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const { data, error } = await supabase.from('verification_tokens').select('id').limit(1);
    if (error) {
      results.supabase_db = `❌ FAILED: ${error.message}`;
    } else {
      results.supabase_db = `✅ verification_tokens table accessible`;
    }
  } catch (e) {
    results.supabase_db = `❌ Exception: ${e.message}`;
  }

  // 4. Test SendGrid key by calling their API validation endpoint
  try {
    const sgResponse = await fetch('https://api.sendgrid.com/v3/scopes', {
      headers: {
        Authorization: `Bearer ${process.env.VITE_SENDGRID_API_KEY}`,
      },
    });
    const sgData = await sgResponse.json();
    if (sgResponse.ok) {
      const hasSendScope = sgData.scopes?.includes('mail.send');
      results.sendgrid = hasSendScope
        ? `✅ API Key valid and has mail.send scope`
        : `⚠️ API Key valid but missing mail.send scope! Scopes: ${sgData.scopes?.join(', ')}`;
    } else {
      results.sendgrid = `❌ FAILED (${sgResponse.status}): ${JSON.stringify(sgData)}`;
    }
  } catch (e) {
    results.sendgrid = `❌ Exception: ${e.message}`;
  }

  return res.status(200).json(results);
}
