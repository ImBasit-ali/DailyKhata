import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import LoadingState from '@/components/ui/LoadingState';

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    // Supabase handles the token exchange automatically in the background
    // We just need to give it a brief moment and then redirect to home
    const timeout = setTimeout(() => {
      navigate('/', { replace: true });
    }, 1500);

    return () => clearTimeout(timeout);
  }, [navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
      <LoadingState type="page" />
      <p className="mt-4 text-slate-600 font-medium">Completing authentication...</p>
    </div>
  );
}
