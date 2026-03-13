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
    // 1. Check token
    const { data: tokenData, error: tokenError } = await supabase
      .from('verification_tokens')
      .select('*')
      .eq('token', token)
      .is('used_at', null)
      .single();

    if (tokenError || !tokenData) {
      console.warn('Invalid or expired token attempt:', token);
      return res.status(400).json({ error: 'Invalid or already-used verification token.' });
    }

    if (new Date(tokenData.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Verification token has expired.' });
    }

    // 2. Mark token as used
    const { error: updateTokenError } = await supabase
      .from('verification_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', tokenData.id);

    if (updateTokenError) {
      console.error('Failed to stamp token as used:', updateTokenError);
      throw updateTokenError;
    }

    // 3. Update user metadata to verified: true
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      tokenData.user_id,
      { user_metadata: { verified: true } }
    );

    if (updateError) {
      console.error('Failed to update user account status:', updateError);
      throw updateError;
    }

    return res.status(200).json({ message: 'Email verified successfully!' });
  } catch (error) {
    console.error('Verification handler error:', error);
    return res.status(500).json({ error: error.message });
  }
}
