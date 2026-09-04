import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { syncSupabaseToLocal, syncLocalToSupabase } from '@/utils/syncManager'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        syncSupabaseToLocal(session.user)
      }
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      
      if (_event === 'SIGNED_IN' && session?.user) {
        syncSupabaseToLocal(session.user)
      } else if (_event === 'SIGNED_OUT') {
        // Clear user specific local storage keys
        const keysToClear = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('dailykhata_')) {
            keysToClear.push(key);
          }
        }
        keysToClear.forEach(k => localStorage.removeItem(k));
      }

      setLoading(false)
    })

    const handleDataChange = () => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          syncLocalToSupabase(session.user);
        }
      });
    };
    window.addEventListener('dailykhata_data_changed', handleDataChange);

    return () => {
      subscription.unsubscribe()
      window.removeEventListener('dailykhata_data_changed', handleDataChange);
    }
  }, [])

  const signUp = async (emailOrObj, passwordArg, metadata = {}) => {
    let email = ''
    let password = ''
    let userMeta = {}

    if (typeof emailOrObj === 'object' && emailOrObj !== null) {
      email = emailOrObj.email
      password = emailOrObj.password
      userMeta = emailOrObj.options?.data || (emailOrObj.name ? { full_name: emailOrObj.name } : {})
    } else {
      email = emailOrObj
      password = passwordArg
      userMeta = typeof metadata === 'object' && metadata !== null ? metadata : {}
    }

    const { data, error } = await supabase.auth.signUp({
      email: email ? String(email).trim() : '',
      password: password ? String(password) : '',
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: userMeta,
      },
    })
    return { data, error }
  }

  const signIn = async (emailOrObj, passwordArg) => {
    let email = ''
    let password = ''

    if (typeof emailOrObj === 'object' && emailOrObj !== null) {
      email = emailOrObj.email
      password = emailOrObj.password
    } else {
      email = emailOrObj
      password = passwordArg
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email ? String(email).trim() : '',
      password: password ? String(password) : '',
    })
    return { data, error }
  }

  const signInWithGoogle = async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    return { data, error }
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    return { error }
  }

  const value = {
    user,
    session,
    loading,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
