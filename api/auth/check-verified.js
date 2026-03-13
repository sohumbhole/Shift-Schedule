/**
 * /api/auth/check-verified
 * Checks both the verification_tokens table AND user metadata.
 * Status is synced back to metadata if only the token was used.
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // 1. Check user metadata first
    const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(userId);
    if (!userError && (user.user_metadata?.verified === true || user.email_confirmed_at)) {
       return res.status(200).json({ verified: true });
    }

    // 2. Check if any verification token for this user has been used
    const { data, error: tokenError } = await supabase
      .from('verification_tokens')
      .select('used_at')
      .eq('user_id', userId)
      .not('used_at', 'is', null)
      .limit(1);

    if (tokenError) throw tokenError;

    const isTokenVerified = data && data.length > 0;

    // 3. If token verified but metadata wasn't, sync it now
    if (isTokenVerified) {
       await supabase.auth.admin.updateUserById(userId, {
         user_metadata: { verified: true }
       });
    }

    return res.status(200).json({ verified: isTokenVerified });
  } catch (err) {
    console.error('check-verified error:', err);
    return res.status(500).json({ error: err.message });
  }
}
