/**
 * /api/auth/verify
 * Validates the email verification token and sets verified=true on the user account.
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Token is required' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // 1. Find the token in the DB
    const { data: tokenData, error: tokenError } = await supabase
      .from('verification_tokens')
      .select('*')
      .eq('token', token)
      .is('used_at', null)
      .single();

    if (tokenError || !tokenData) {
      return res.status(400).json({ error: 'Invalid or already-used verification token.' });
    }

    if (new Date(tokenData.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Verification token has expired. Please sign up again to get a new link.' });
    }

    // 2. Mark token as used
    const { error: updateTokenError } = await supabase
      .from('verification_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', tokenData.id);

    if (updateTokenError) throw updateTokenError;

    // 3. Update the user's app_metadata to set verified=true
    // Using app_metadata (not user_metadata) because app_metadata can only be 
    // written by the service role — users can't tamper with it themselves.
    const { error: updateUserError } = await supabase.auth.admin.updateUserById(
      tokenData.user_id,
      { app_metadata: { verified: true } }
    );

    if (updateUserError) {
      console.error('Failed to update user metadata:', updateUserError);
      throw updateUserError;
    }

    return res.status(200).json({ message: 'Email verified successfully!' });
  } catch (error) {
    console.error('Verification error:', error);
    return res.status(500).json({ error: error.message });
  }
}
