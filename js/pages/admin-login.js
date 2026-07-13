/**
 * YRSF — Admin Login Page Logic
 */

import { login, getSession } from '../services/auth.js';

document.addEventListener('DOMContentLoaded', async () => {
  // If already logged in, redirect to dashboard
  const session = await getSession();
  if (session) {
    window.location.href = '/admin/dashboard.html';
    return;
  }

  const form = document.getElementById('login-form');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
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

    const email = emailInput?.value?.trim();
    const password = passwordInput?.value;

    if (!email || !password) {
      showError('Please enter your email and password.');
      return;
    }

    setLoading(true);
    hideError();

    const { user, error } = await login(email, password);

    if (error) {
      setLoading(false);
      showError(error);
      return;
    }

    // Success — redirect to dashboard
    window.location.href = '/admin/dashboard.html';
  });

  function setLoading(loading) {
    if (loginBtn) loginBtn.disabled = loading;
    if (loginBtnText) loginBtnText.textContent = loading ? 'Signing in...' : 'Sign In';
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
