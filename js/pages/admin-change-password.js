/**
 * YRSF — Change Password Page Logic
 */

import { supabase } from '../config/supabase.js';
import { getSession } from '../services/auth.js';

document.addEventListener('DOMContentLoaded', async () => {
  const session = await getSession();
  if (!session) {
    window.location.href = '/admin/index.html';
    return;
  }

  // Double check they actually need a password change
  if (!session.user.user_metadata?.needs_password_change) {
    window.location.href = '/admin/dashboard.html';
    return;
  }

  const form = document.getElementById('login-form'); // ID reused from index.html
  const passwordInput = document.getElementById('password');
  const confirmPasswordInput = document.getElementById('confirm_password');
  const loginBtn = document.getElementById('login-btn');
  const loginBtnText = document.getElementById('login-btn-text');
  const loginSpinner = document.getElementById('login-spinner');
  const errorBox = document.getElementById('login-error');
  const errorText = document.getElementById('login-error-text');
  const togglePwd = document.getElementById('toggle-password');

  // Toggle password visibility
  if (togglePwd && passwordInput) {
    togglePwd.addEventListener('click', () => {
      const isPassword = passwordInput.type === 'password';
      passwordInput.type = isPassword ? 'text' : 'password';
      togglePwd.querySelector('.material-symbols-outlined').textContent =
        isPassword ? 'visibility_off' : 'visibility';
    });
  }

  // Handle form submission
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const password = passwordInput?.value;
    const confirmPassword = confirmPasswordInput?.value;

    if (!password || !confirmPassword) {
      showError('Please enter a new password.');
      return;
    }

    if (password !== confirmPassword) {
      showError('Passwords do not match.');
      return;
    }

    if (password.length < 6) {
      showError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    hideError();

    // 1. Update the password
    const { data, error } = await supabase.auth.updateUser({
      password: password,
      data: { needs_password_change: false } // Remove the flag
    });

    if (error) {
      setLoading(false);
      showError(error.message);
      return;
    }

    // Success — redirect to dashboard
    window.location.href = '/admin/dashboard.html';
  });

  function setLoading(loading) {
    if (loginBtn) loginBtn.disabled = loading;
    if (loginBtnText) loginBtnText.textContent = loading ? 'Saving...' : 'Save Password';
    if (loginSpinner) loginSpinner.classList.toggle('hidden', !loading);
  }

  function showError(message) {
    if (errorBox) errorBox.classList.remove('hidden');
    if (errorText) errorText.textContent = message;
  }

  function hideError() {
    if (errorBox) errorBox.classList.add('hidden');
  }
});
