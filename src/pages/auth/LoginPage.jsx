import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { BuildingOfficeIcon } from '@heroicons/react/24/solid';
import { EyeIcon, EyeSlashIcon, ExclamationCircleIcon, InformationCircleIcon } from '@heroicons/react/24/outline';

export default function LoginPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const { user, signIn, signUp, signInWithGoogle } = useAuth();
  const navigate = useNavigate();

  // If already authenticated, redirect to dashboard
  if (user) {
    return <Navigate to="/" replace />;
  }

  const toggleMode = () => {
    setIsSignUp(!isSignUp);
    setValidationError('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const validateForm = () => {
    setValidationError('');

    if (isSignUp && !firstName.trim()) {
      const msg = 'Please enter your first name.';
      setValidationError(msg);
      toast.error(msg);
      return false;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      const msg = 'Please enter your email address.';
      setValidationError(msg);
      toast.error(msg);
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      const msg = 'Please enter a valid email address.';
      setValidationError(msg);
      toast.error(msg);
      return false;
    }

    if (!password) {
      const msg = 'Please enter your password.';
      setValidationError(msg);
      toast.error(msg);
      return false;
    }

    if (password.length < 6) {
      const msg = 'Password must be at least 6 characters long.';
      setValidationError(msg);
      toast.error(msg);
      return false;
    }

    if (isSignUp) {
      if (!confirmPassword) {
        const msg = 'Please confirm your password.';
        setValidationError(msg);
        toast.error(msg);
        return false;
      }

      if (password !== confirmPassword) {
        const msg = 'Passwords do not match. Please check and try again.';
        setValidationError(msg);
        toast.error(msg);
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    setValidationError('');

    try {
      if (isSignUp) {
        const { data, error } = await signUp(
          email.trim(),
          password,
          { full_name: firstName.trim(), first_name: firstName.trim() }
        );
        if (error) throw error;

        // Check if user already exists
        if (data?.user && data.user.identities && data.user.identities.length === 0) {
          const msg = 'This email is already registered. Please sign in instead.';
          setValidationError(msg);
          toast.error(msg);
          setIsSignUp(false);
          return;
        }

        if (data?.session) {
          toast.success('Account created successfully!');
          navigate('/');
        } else {
          toast.success(
            'Account created! Please check your email inbox to confirm your registration.',
            { duration: 6000 }
          );
          setIsSignUp(false);
          setPassword('');
          setConfirmPassword('');
        }
      } else {
        const { error } = await signIn(email.trim(), password);
        if (error) throw error;
        toast.success('Signed in successfully!');
        navigate('/');
      }
    } catch (error) {
      console.error('Auth error:', error);
      let errorMsg = error.message || 'An error occurred during authentication';
      
      if (errorMsg.includes('Invalid login credentials')) {
        errorMsg = 'Incorrect email or password. Please try again.';
      } else if (errorMsg.includes('User already registered')) {
        errorMsg = 'An account with this email already exists. Please sign in.';
      } else if (errorMsg.includes('Email not confirmed')) {
        errorMsg = 'Please verify your email address before signing in. Check your inbox for the confirmation link.';
      }
      
      setValidationError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setValidationError('');

    try {
      const { error } = await signInWithGoogle();
      if (error) throw error;
    } catch (error) {
      console.error('Google auth error:', error);
      let msg = error.message || 'Failed to authenticate with Google';
      if (msg.includes('provider is not enabled') || msg.includes('Unsupported provider')) {
        msg = 'Google sign-in is not enabled in your Supabase project. Please enable Google in Supabase Dashboard -> Authentication -> Providers.';
      }
      setValidationError(msg);
      toast.error(msg, { duration: 6000 });
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-gradient-to-br from-slate-100 to-indigo-50">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="mx-auto h-16 w-16 bg-indigo-600 rounded-xl shadow-lg flex items-center justify-center transform -rotate-6 mb-6">
          <BuildingOfficeIcon className="h-10 w-10 text-white transform rotate-6" />
        </div>
        <h2 className="mt-2 text-center text-4xl font-extrabold text-slate-900 tracking-tight">
          DailyKhata
        </h2>
        <p className="mt-2 text-center text-sm text-slate-600 font-medium">
          Multi-Company Ledger & Inventory Management
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl shadow-slate-200 sm:rounded-2xl sm:px-10 border border-slate-100">
          {/* Validation / Error Message */}
          {validationError && (
            <div className="mb-5 p-3.5 rounded-lg bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-rose-700 text-sm">
              <ExclamationCircleIcon className="h-5 w-5 flex-shrink-0 mt-0.5 text-rose-500" />
              <div className="flex-1 leading-snug">{validationError}</div>
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit} noValidate>
            {/* First Name Field (Only in Sign Up mode) */}
            {isSignUp && (
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-slate-700">
                  First name
                </label>
                <div className="mt-1">
                  <input
                    id="firstName"
                    name="firstName"
                    type="text"
                    autoComplete="given-name"
                    required
                    value={firstName}
                    onChange={(e) => {
                      setFirstName(e.target.value);
                      if (validationError) setValidationError('');
                    }}
                    className="appearance-none block w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
                    placeholder="e.g. Basit"
                  />
                </div>
              </div>
            )}

            {/* Email Field */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                Email address
              </label>
              <div className="mt-1">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (validationError) setValidationError('');
                  }}
                  className="appearance-none block w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            {/* Password Field with Show/Hide Toggle */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                Password
              </label>
              <div className="mt-1 relative rounded-lg shadow-sm">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (validationError) setValidationError('');
                  }}
                  className="appearance-none block w-full px-3 py-2 pr-10 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeSlashIcon className="h-5 w-5 text-indigo-600" />
                  ) : (
                    <EyeIcon className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Confirm Password Field (Only in Sign Up mode) with Show/Hide Toggle */}
            {isSignUp && (
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700">
                  Confirm password
                </label>
                <div className="mt-1 relative rounded-lg shadow-sm">
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (validationError) setValidationError('');
                    }}
                    className={`appearance-none block w-full px-3 py-2 pr-10 border rounded-lg shadow-sm placeholder-slate-400 focus:outline-none sm:text-sm transition-colors ${
                      confirmPassword && password !== confirmPassword
                        ? 'border-rose-300 focus:ring-rose-500 focus:border-rose-500'
                        : 'border-slate-300 focus:ring-indigo-500 focus:border-indigo-500'
                    }`}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
                    aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                    title={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                  >
                    {showConfirmPassword ? (
                      <EyeSlashIcon className="h-5 w-5 text-indigo-600" />
                    ) : (
                      <EyeIcon className="h-5 w-5" />
                    )}
                  </button>
                </div>
                {confirmPassword && password !== confirmPassword && (
                  <p className="mt-1 text-xs text-rose-600">
                    Passwords do not match
                  </p>
                )}
              </div>
            )}

            {/* Submit Button */}
            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Processing...' : (isSignUp ? 'Create account' : 'Sign in')}
              </button>
            </div>
          </form>

          {/* Social Login Divider */}
          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-slate-500">Or continue with</span>
              </div>
            </div>

            {/* Google OAuth Button */}
            <div className="mt-6">
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={googleLoading}
                className="w-full inline-flex justify-center py-2.5 px-4 border border-slate-300 rounded-lg shadow-sm bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors disabled:opacity-50"
              >
                {googleLoading ? (
                  <svg className="animate-spin h-5 w-5 text-slate-600 mr-2" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                )}
                Google
              </button>
            </div>
          </div>
          
          {/* Bottom Switch between Sign in and Sign up (original UI style) */}
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={toggleMode}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-500 transition-colors"
            >
              {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
