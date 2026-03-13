import { createClient } from '@supabase/supabase-js';
import sgMail from '@sendgrid/mail';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sendgridApiKey = process.env.VITE_SENDGRID_API_KEY;
const appBaseUrl = process.env.VITE_APP_BASE_URL || 'https://shift-schedule-website.vercel.app';

sgMail.setApiKey(sendgridApiKey);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // 1. Check if user exists
    const { data: users, error: userError } = await supabase.auth.admin.listUsers();
    const user = (users.users || []).find(u => u.email === email);

    if (userError || !user) {
      // Don't reveal if user exists for security, just say email sent
      return res.status(200).json({ message: 'If an account exists with that email, a password reset link has been sent.' });
    }

    // 2. Generate reset token (or use Supabase recovery link)
    const { data: recoveryData, error: recoveryError } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: email,
      options: { redirectTo: `${appBaseUrl}/reset-password` }
    });

    if (recoveryError) throw recoveryError;

    const resetUrl = recoveryData.properties.action_link;

    // 3. Send email via SendGrid
    const msg = {
      to: email,
      from: 'noreply@shift-schedule.app',
      subject: 'Reset your Shift Schedule password',
      text: `Click this link to reset your password: ${resetUrl}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #f97316;">Password Reset Request</h1>
          <p>We received a request to reset your password. Click the button below to choose a new one.</p>
          <a href="${resetUrl}" style="display: inline-block; background-color: #f97316; color: white; padding: 12px 24px; text-decoration: none; rounded: 8px; font-weight: bold;">Reset Password</a>
          <p style="margin-top: 20px; color: #64748b;">If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    };

    await sgMail.send(msg);

    return res.status(200).json({ message: 'If an account exists with that email, a password reset link has been sent.' });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ error: error.message });
  }
}
