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
    // 1. Check if user already exists
    const { data: users, error: listError } = await supabase.auth.admin.listUsers();
    let user = (users?.users || []).find(u => u.email === email);
    let userId;

    if (!user) {
      // 2. Create user if they don't exist
      const { data: userData, error: signUpError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { verified: false }
      });

      if (signUpError) {
        console.error('Supabase Auth Error:', signUpError);
        return res.status(signUpError.status || 400).json({ error: `Supabase Auth Error: ${signUpError.message}` });
      }
      userId = userData.user.id;
    } else {
      // User exists - check if already verified
      if (user.user_metadata?.verified === true) {
        return res.status(400).json({ error: 'This email is already verified. Please sign in.' });
      }
      userId = user.id;
    }

    // 3. Generate verification token
    const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // 4. Store token in verification_tokens table
    const { error: tokenError } = await supabase
      .from('verification_tokens')
      .insert({
        user_id: userId,
        token: token,
        expires_at: expiresAt
      });

    if (tokenError) {
      console.error('Database Error:', tokenError);
      return res.status(400).json({ error: `Database Error: ${tokenError.message}. Make sure SUPABASE_SERVICE_ROLE_KEY is correct in Vercel.` });
    }

    // 5. Send email via SendGrid
    const verifyUrl = `${appBaseUrl}/verify-email?token=${token}`;
    
    const msg = {
      to: email,
      from: 'sohumbhole@gmail.com',
      subject: 'Verify your Shift Schedule account',
      text: `Please verify your account by clicking this link: ${verifyUrl}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #f97316;">Welcome to Shift Schedule!</h1>
          <p>Thank you for signing up. Please verify your email address to get started.</p>
          <div style="margin: 30px 0;">
            <a href="${verifyUrl}" style="background-color: #f97316; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Verify Account</a>
          </div>
          <p style="color: #64748b; font-size: 14px;">If the button doesn't work, copy and paste this link:<br>${verifyUrl}</p>
        </div>
      `,
    };

    try {
      await sgMail.send(msg);
    } catch (mailError) {
      const errorMsg = mailError.response?.body?.errors?.[0]?.message || mailError.message;
      return res.status(500).json({ error: `SendGrid Error: ${errorMsg}` });
    }

    return res.status(200).json({ message: 'Verification email sent! Please check your inbox.' });
  } catch (error) {
    console.error('Unexpected Signup error:', error);
    return res.status(500).json({ error: `Unexpected Error: ${error.message}` });
  }
}
