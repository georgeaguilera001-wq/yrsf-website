/**
 * Supabase Client Configuration
 * =============================
 * This module initializes and exports a singleton Supabase client
 * for use throughout the YRSF application.
 *
 * SETUP: Replace the placeholder values below with your actual
 * Supabase project credentials from https://app.supabase.com
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ─── Supabase Credentials ────────────────────────────────────────────────────
// TODO: Replace with your Supabase project URL (Settings > API > Project URL)
const SUPABASE_URL = 'https://udacadmmeyvykiiptsvb.supabase.co';

// TODO: Replace with your Supabase anon/public key (Settings > API > anon public)
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkYWNhZG1tZXl2eWtpaXB0c3ZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3MzY1MzAsImV4cCI6MjA5ODMxMjUzMH0.8cPpGjkEZ7WgChuwwovbK9rhjHRClnIElyygYABycR8';

// ─── Self-Check ──────────────────────────────────────────────────────────────
// Warn developers if placeholder credentials haven't been replaced
if (SUPABASE_URL === 'https://placeholder.supabase.co' || SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY_HERE') {
  console.warn(
    '%c⚠️ YRSF Supabase Config',
    'color: #f59e0b; font-weight: bold; font-size: 14px;',
    '\n\nSupabase credentials have not been configured!',
    '\nPlease update SUPABASE_URL and SUPABASE_ANON_KEY in js/config/supabase.js',
    '\nwith your project credentials from https://app.supabase.com',
    '\n\nThe application will not be able to fetch data until this is done.'
  );
}

// ─── Client Initialization ──────────────────────────────────────────────────
/**
 * Singleton Supabase client instance.
 * Import this in any module that needs to interact with the database:
 *
 *   import { supabase } from '/js/config/supabase.js';
 *   const { data, error } = await supabase.from('boats').select('*');
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
