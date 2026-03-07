import React, { createContext, useState, useContext, useEffect } from 'react';
import { api } from '@/api/api';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { supabase } from '@/lib/supabaseClient';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings, setAppPublicSettings] = useState({ id: 'local', public_settings: {} });

  useEffect(() => {
    checkAppState();
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({ id: session.user.id, email: session.user.email ?? '', role: 'admin' });
        setAuthError(null);
        setIsAuthenticated(true);
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const checkAppState = async () => {
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);
      try {
        const currentUser = await api.auth.me();
        setUser(currentUser);
        setIsAuthenticated(true);
        setAppPublicSettings({ id: 'local', public_settings: {} });
      } catch (err) {
        if (isSupabaseConfigured()) {
          setUser(null);
          setIsAuthenticated(false);
          setAuthError({ type: 'auth_required', message: 'Authentication required' });
        } else {
          setUser({ id: 'mock-user', email: 'local@example.com', role: 'admin' });
          setIsAuthenticated(true);
          setAppPublicSettings({ id: 'local', public_settings: {} });
        }
      }
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
    } catch (error) {
      console.error('Unexpected error:', error);
      setAuthError({ type: 'unknown', message: error.message || 'An unexpected error occurred' });
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
    }
  };

  const logout = async (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    if (isSupabaseConfigured()) {
      await api.auth.logout();
      if (shouldRedirect) window.location.href = '/login';
    } else if (shouldRedirect) {
      api.auth.logout(window.location.href);
    } else {
      api.auth.logout();
    }
  };

  const navigateToLogin = () => {
    api.auth.redirectToLogin(window.location.href);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoadingAuth,
        isLoadingPublicSettings,
        authError,
        appPublicSettings,
        logout,
        navigateToLogin,
        checkAppState,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
