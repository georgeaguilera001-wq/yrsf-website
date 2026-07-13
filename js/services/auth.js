/**
 * YRSF — Auth Service
 * Supabase authentication for admin portal.
 */

import { supabase } from '../config/supabase.js';

/** Sign in with email and password */
export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    return { user: null, error: error.message };
  }

  return { user: data.user, error: null };
}

/** Sign out */
export async function logout() {
  const { error } = await supabase.auth.signOut();
  return { error: error?.message || null };
}

/** Get current session */
export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

/** Get current user */
export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/** Subscribe to auth state changes. Returns unsubscribe function. */
export function onAuthStateChange(callback) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (event, session) => callback(event, session)
  );
  return () => subscription.unsubscribe();
}

/**
 * Auth guard for admin pages.
 * Redirects to login if not authenticated.
 * Returns user if authenticated.
 */
export async function requireAuth(redirectUrl = '/admin/index.html') {
  const session = await getSession();

  if (!session) {
    window.location.href = redirectUrl;
    // Throw to prevent further execution in the calling code
    throw new Error('Not authenticated');
  }

  return session.user;
}
