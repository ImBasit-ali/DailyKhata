import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import LoadingState from '@/components/ui/LoadingState';

/**
 * AuthCallback — handles the OAuth redirect from Google.
 *
 * Supabase processes the URL hash/code automatically when detectSessionInUrl:true
 * is set in the client (which it is). We listen for the first SIGNED_IN event
 * rather than relying on an arbitrary timeout, so we only redirect after the
 * session is confirmed.
 *
 * After authentication we decide where to send the user:
 *   - Google-only user (no email provider & password not yet created):
 *       → /auth/set-password   (optional — they can skip)
 *   - Everyone else:
 *       → /
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const handled = useRef(false); // prevent duplicate navigation

  useEffect(() => {
    // Handle OAuth errors surfaced in the URL (e.g. user denied Google consent)
    const hash = window.location.hash;
    const params = new URLSearchParams(window.location.search);
    const errorCode = params.get('error') || (hash.includes('error=') ? new URLSearchParams(hash.slice(1)).get('error') : null);

    if (errorCode) {
      console.error('OAuth error in callback URL:', errorCode, params.get('error_description'));
      navigate('/auth', { replace: true });
      return;
    }

    // Listen for Supabase to complete the session exchange
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (handled.current) return;

      if (event === 'SIGNED_IN' && session?.user) {
        handled.current = true;

        const user = session.user;

        // Determine if this is a Google-only user who has not yet created a
        // DailyKhata password.
        //
        // Supabase stores authentication providers in two places:
        //   user.app_metadata.providers  — array like ['google'] or ['google','email']
        //   user.identities              — array of identity objects
        //
        // A user who has set a DailyKhata password via updateUser() will have
        // 'email' added to their providers array by Supabase.
        //
        // We also check a localStorage skip-flag so we don't re-prompt users
        // who already chose "Skip for now".
        const providers = user.app_metadata?.providers || [];
        const isGoogleOnly = providers.includes('google') && !providers.includes('email');
        const skipKey = `dailykhata_skip_set_password_${user.id}`;
        const skipped = localStorage.getItem(skipKey) === '1';

        if (isGoogleOnly && !skipped) {
          navigate('/auth/set-password', { replace: true });
        } else {
          navigate('/', { replace: true });
        }
      } else if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        // Ignore — we only care about SIGNED_IN in this callback
      }
    });

    // Safety fallback: if Supabase has ALREADY processed the session before we
    // subscribed (rare but possible on fast networks), check once synchronously.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (handled.current) return;
      if (session?.user) {
        handled.current = true;

        const user = session.user;
        const providers = user.app_metadata?.providers || [];
        const isGoogleOnly = providers.includes('google') && !providers.includes('email');
        const skipKey = `dailykhata_skip_set_password_${user.id}`;
        const skipped = localStorage.getItem(skipKey) === '1';

        if (isGoogleOnly && !skipped) {
          navigate('/auth/set-password', { replace: true });
        } else {
          navigate('/', { replace: true });
        }
      }
    });

    // Hard timeout: if nothing happens in 8 seconds, send to login
    const timeout = setTimeout(() => {
      if (!handled.current) {
        handled.current = true;
        navigate('/auth', { replace: true });
      }
    }, 8000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
      <LoadingState type="page" />
      <p className="mt-4 text-slate-600 font-medium">Completing authentication...</p>
    </div>
  );
}
