import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isConfigured: boolean;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const isConfigured = isSupabaseConfigured();

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: new Error('Supabase not configured') as unknown as AuthError };
    console.log('[Auth] Attempting signIn with email:', email, 'password length:', password?.length);

    // Debug: try raw fetch first
    const url = import.meta.env.VITE_SUPABASE_URL?.trim();
    const keyRaw = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const key = keyRaw?.trim();
    console.log('[Auth] Key RAW length:', keyRaw?.length, 'TRIMMED length:', key?.length);
    console.log('[Auth] Key first 30:', JSON.stringify(key?.substring(0, 30)));
    console.log('[Auth] Key last 30:', JSON.stringify(key?.substring(key.length - 30)));
    // Find invalid chars
    const invalidChars = key?.split('').filter((c: string) => !/[A-Za-z0-9._-]/.test(c));
    console.log('[Auth] Invalid chars found:', JSON.stringify(invalidChars));

    try {
      const testRes = await fetch(`${url}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': key || '',
        },
        body: JSON.stringify({ email, password })
      });
      console.log('[Auth] Raw fetch response:', testRes.status);
    } catch (rawErr) {
      console.error('[Auth] Raw fetch failed:', rawErr);
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      console.log('[Auth] signIn result:', error ? error.message : 'success');
      return { error };
    } catch (e) {
      console.error('[Auth] signIn exception:', e);
      return { error: e as AuthError };
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: new Error('Supabase not configured') as unknown as AuthError };
    const { error } = await supabase.auth.signUp({ email, password });
    return { error };
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, loading, isConfigured, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
