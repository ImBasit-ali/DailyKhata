import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { BuildingOfficeIcon, EyeIcon, EyeSlashIcon, ExclamationCircleIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

/**
 * SetPasswordPage
 *
 * Shown to Google OAuth users after their first login so they can optionally
 * create a DailyKhata email/password credential.
 *
 * This allows them to later log in on any device using:
 *   email = their Google/Gmail email
 *   password = the DailyKhata password they set here
 *
 * IMPORTANT SECURITY RULES:
 *  - We NEVER ask for, store, or transmit the user's Google/Gmail password.
 *  - The password is only sent to Supabase via supabase.auth.updateUser().
 *  - It is NEVER stored in localStorage, a database table, or React state
 *    beyond the temporary form inputs while the user is typing.
 *  - After the form submits, all password state is cleared.
 */

const MIN_PASSWORD_LENGTH = 8;

export default function SetPasswordPage() {
  const { user, setPassword } = useAuth();
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // If not authenticated at all, redirect to login
  useEffect(() => {
    if (user === null) {
      navigate('/auth', { replace: true });
    }
  }, [user, navigate]);

  // If user already has email provider (password already set), skip to dashboard
  useEffect(() => {
    if (!user) return;
    const providers = user.app_metadata?.providers || [];
    if (providers.includes('email')) {
      // Already has a DailyKhata password — go straight to dashboard
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  if (!user) return null;

  const userEmail = user.email || '';

  const validate = () => {
    setValidationError('');

    if (!newPassword) {
      const msg = 'Please enter a new password.';
      setValidationError(msg);
      return false;
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      const msg = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
      setValidationError(msg);
      return false;
    }

    if (!confirmPassword) {
      const msg = 'Please confirm your password.';
      setValidationError(msg);
      return false;
    }

    if (newPassword !== confirmPassword) {
      const msg = 'Passwords do not match.';
      setValidationError(msg);
      return false;
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    if (!user) {
      setValidationError('Please sign in before creating a password.');
      return;
    }

    setLoading(true);
    setValidationError('');

    try {
      const { error } = await setPassword(newPassword);

      if (error) {
        // Show safe Supabase error — never expose the password itself
        let msg = error.message || 'Failed to create password. Please try again.';
        if (msg.toLowerCase().includes('same password')) {
          msg = 'Please choose a different password.';
        } else if (msg.toLowerCase().includes('weak password')) {
          msg = 'Password is too weak. Please choose a stronger password.';
        }
        setValidationError(msg);
        toast.error(msg);
      } else {
        // Password created — clear form state immediately
        setNewPassword('');
        setConfirmPassword('');
        setSuccess(true);
        toast.success('DailyKhata password created successfully!');
      }
    } catch (err) {
      const msg = 'An unexpected error occurred. Please try again.';
      setValidationError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    // Mark that the user skipped so the callback won't send them here again
    // on subsequent Google logins.
    // NOTE: We store ONLY the skip-flag (boolean), never the password.
    if (user?.id) {
      localStorage.setItem(`dailykhata_skip_set_password_${user.id}`, '1');
    }
    navigate('/', { replace: true });
  };

  const handleContinueToDashboard = () => {
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      {/* Logo / Branding */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="mx-auto h-16 w-16 bg-indigo-600 rounded-xl shadow-lg flex items-center justify-center transform -rotate-6 mb-6">
          <BuildingOfficeIcon className="h-10 w-10 text-white transform rotate-6" />
        </div>
        <h2 className="text-center text-4xl font-extrabold text-slate-900 tracking-tight">
          DailyKhata
        </h2>
        <p className="mt-2 text-center text-sm text-slate-600 font-medium">
          Multi-Company Ledger &amp; Inventory Management
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl shadow-slate-200 sm:rounded-2xl sm:px-10 border border-slate-100">

          {success ? (
            /* ── Success State ── */
            <div className="text-center space-y-4">
              <div className="mx-auto h-14 w-14 bg-emerald-100 rounded-full flex items-center justify-center">
                <CheckCircleIcon className="h-8 w-8 text-emerald-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Password Created!</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Your DailyKhata password has been set. You can now sign in on any device using:
              </p>
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-left text-xs space-y-1">
                <p className="font-semibold text-indigo-900">Email:</p>
                <p className="font-mono text-indigo-700">{userEmail}</p>
                <p className="font-semibold text-indigo-900 mt-2">Password:</p>
                <p className="text-indigo-700">The password you just created</p>
              </div>
              <p className="text-xs text-slate-400">
                Your Google account is still linked — you can continue using Google sign-in too.
              </p>
              <button
                type="button"
                onClick={handleContinueToDashboard}
                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
              >
                Continue to Dashboard
              </button>
            </div>
          ) : (
            /* ── Password Creation Form ── */
            <>
              <div className="mb-6">
                <h3 className="text-xl font-bold text-slate-900">
                  Create your DailyKhata password
                </h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  You signed in with Google (<span className="font-medium text-slate-800">{userEmail}</span>).
                </p>
                <p className="mt-1 text-sm text-slate-600 leading-relaxed">
                  Create a DailyKhata password so you can also log in using your email and password on other devices — without needing Google.
                </p>
                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 leading-relaxed">
                  <strong>Note:</strong> This is <em>not</em> your Google/Gmail password. It is a separate password only for DailyKhata.
                </div>
              </div>

              {/* Validation Error */}
              {validationError && (
                <div className="mb-5 p-3.5 rounded-lg bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-rose-700 text-sm">
                  <ExclamationCircleIcon className="h-5 w-5 flex-shrink-0 mt-0.5 text-rose-500" />
                  <div className="flex-1 leading-snug">{validationError}</div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                {/* New Password */}
                <div>
                  <label htmlFor="newPassword" className="block text-sm font-medium text-slate-700">
                    New password
                  </label>
                  <div className="mt-1 relative rounded-lg shadow-sm">
                    <input
                      id="newPassword"
                      name="newPassword"
                      type={showNew ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={newPassword}
                      onChange={(e) => {
                        setNewPassword(e.target.value);
                        if (validationError) setValidationError('');
                      }}
                      className="appearance-none block w-full px-3 py-2 pr-10 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNew(!showNew)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
                      aria-label={showNew ? 'Hide password' : 'Show password'}
                    >
                      {showNew ? (
                        <EyeSlashIcon className="h-5 w-5 text-indigo-600" />
                      ) : (
                        <EyeIcon className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    Minimum {MIN_PASSWORD_LENGTH} characters
                  </p>
                </div>

                {/* Confirm Password */}
                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700">
                    Confirm password
                  </label>
                  <div className="mt-1 relative rounded-lg shadow-sm">
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type={showConfirm ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        if (validationError) setValidationError('');
                      }}
                      className={`appearance-none block w-full px-3 py-2 pr-10 border rounded-lg shadow-sm placeholder-slate-400 focus:outline-none sm:text-sm transition-colors ${
                        confirmPassword && newPassword !== confirmPassword
                          ? 'border-rose-300 focus:ring-rose-500 focus:border-rose-500'
                          : 'border-slate-300 focus:ring-indigo-500 focus:border-indigo-500'
                      }`}
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
                      aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
                    >
                      {showConfirm ? (
                        <EyeSlashIcon className="h-5 w-5 text-indigo-600" />
                      ) : (
                        <EyeIcon className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                  {confirmPassword && newPassword !== confirmPassword && (
                    <p className="mt-1 text-xs text-rose-600">
                      Passwords do not match
                    </p>
                  )}
                </div>

                {/* Submit */}
                <div className="pt-1">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {loading ? 'Creating password...' : 'Create Password'}
                  </button>
                </div>
              </form>

              {/* Skip option */}
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={handleSkip}
                  disabled={loading}
                  className="text-sm text-slate-500 hover:text-slate-700 transition-colors underline underline-offset-2"
                >
                  Skip for now — I'll keep using Google to sign in
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
