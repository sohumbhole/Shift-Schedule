import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { Flame, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState('verifying'); // 'verifying', 'success', 'error'
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('No verification token found.');
      return;
    }

    verifyToken();
  }, [token]);

  const verifyToken = async () => {
    try {
      // 1. Call backend to verify
      const response = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Verification failed');

      setStatus('success');
      setMessage('Your email has been successfully verified! You can now sign in.');
    } catch (err) {
      setStatus('error');
      setMessage(err.message || 'Verification failed.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm text-center space-y-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-orange-500 text-white mb-4">
          <Flame className="w-8 h-8" />
        </div>
        
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 space-y-4">
          {status === 'verifying' && (
            <div className="space-y-4 py-8">
              <Loader2 className="w-12 h-12 animate-spin text-orange-500 mx-auto" />
              <h1 className="text-2xl font-bold text-gray-900">Verifying email</h1>
              <p className="text-slate-500">Please wait while we confirm your account...</p>
            </div>
          )}

          {status === 'success' && (
            <div className="space-y-4">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
              <h1 className="text-2xl font-bold text-gray-900">Email Verified!</h1>
              <p className="text-slate-500">{message}</p>
              <Button 
                onClick={() => navigate('/login')} 
                className="w-full bg-orange-500 hover:bg-orange-600 mt-4"
              >
                Go to Sign In
              </Button>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-4">
              <XCircle className="w-12 h-12 text-red-500 mx-auto" />
              <h1 className="text-2xl font-bold text-gray-900">Verification Failed</h1>
              <p className="text-slate-500">{message}</p>
              <Button 
                onClick={() => navigate('/login')} 
                variant="outline"
                className="w-full mt-4"
              >
                Back to Login
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
