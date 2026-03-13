import { createClient } from '@supabase/supabase-js';
import sgMail from '@sendgrid/mail';

// IMPORTANT: These should be set in Vercel environment variables
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Need service role to manage users
const sendgridApiKey = process.env.VITE_SENDGRID_API_KEY;
const appBaseUrl = process.env.VITE_APP_BASE_URL || 'https://shift-schedule-website.vercel.app';

sgMail.setApiKey(sendgridApiKey);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // 1. Create user in Supabase Auth
    // We disable email confirmation here so the user is created but we manage verification manually
    const { data: userData, error: signUpError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Mark as confirmed in Auth, but we use our own verification flag
      user_metadata: { verified: false }
    });

    if (signUpError) throw signUpError;

    const userId = userData.user.id;

    // 2. Generate verification token
    const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

    // 3. Store token in verification_tokens table
    const { error: tokenError } = await supabase
      .from('verification_tokens')
      .insert({
        user_id: userId,
        token: token,
        expires_at: expiresAt
      });

    if (tokenError) throw tokenError;

    // 4. Send email via SendGrid
    const verifyUrl = `${appBaseUrl}/verify-email?token=${token}`;
    
    const msg = {
      to: email,
      from: 'noreply@shift-schedule.app', // Update with your verified sender
      subject: 'Verify your Shift Schedule account',
      text: `Please verify your account by clicking this link: ${verifyUrl}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #f97316;">Welcome to Shift Schedule!</h1>
          <p>Thank you for signing up. Please verify your email address to get started.</p>
          <a href="${verifyUrl}" style="display: inline-block; background-color: #f97316; color: white; padding: 12px 24px; text-decoration: none; rounded: 8px; font-weight: bold;">Verify Account</a>
          <p style="margin-top: 20px; color: #64748b;">If the button doesn't work, copy and paste this link: ${verifyUrl}</p>
        </div>
      `,
    };

    await sgMail.send(msg);

    return res.status(200).json({ message: 'Signup successful! Please check your email for verification.' });
  } catch (error) {
    console.error('Signup error:', error);
    return res.status(500).json({ error: error.message });
  }
}
