/**
 * /api/auth/check-verified
 * Checks the verification_tokens table to see if a user has ever
 * clicked their verification link (token has a used_at timestamp).
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
    // Check if any verification token for this user has been used
    const { data, error } = await supabase
      .from('verification_tokens')
      .select('used_at')
      .eq('user_id', userId)
      .not('used_at', 'is', null)
      .limit(1);

    if (error) throw error;

    const verified = data && data.length > 0;
    return res.status(200).json({ verified });
  } catch (err) {
    console.error('check-verified error:', err);
    return res.status(500).json({ error: err.message });
  }
}
