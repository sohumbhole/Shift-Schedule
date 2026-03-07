/**
 * API client – uses Supabase when VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set, otherwise the local mock.
 */
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { supabaseApi } from './supabaseApi';
import { mockApi } from './mockApi';

export const api = isSupabaseConfigured() ? supabaseApi : mockApi;
