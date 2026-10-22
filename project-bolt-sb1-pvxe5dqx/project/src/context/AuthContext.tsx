import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { getLocalVocabs, clearLocalVocabs } from '@/lib/storage';
import { syncUserDataWithCloud } from '@/lib/cloudSync';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const purgeSupabaseTokens = () => {
    if (typeof window === 'undefined') return;
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('sb-') || key.includes('supabase.auth') || key.includes('auth-token'))) {
          localStorage.removeItem(key);
        }
      }
    } catch {}
  };

  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error || !data?.session?.user) {
          purgeSupabaseTokens();
          setUser(null);
          setSession(null);
          setLoading(false);
          return;
        }

        const session = data.session;
        const nowSec = Math.floor(Date.now() / 1000);
        if (session.expires_at && session.expires_at < nowSec) {
          console.warn('[AuthContext] Session expired, attempting refresh...');
          const refreshPromise = supabase.auth.refreshSession();
          const timeoutPromise = new Promise<{ data: { session: null }; error: Error }>((resolve) =>
            setTimeout(() => resolve({ data: { session: null }, error: new Error('Refresh timeout') }), 2500)
          );
          const { data: refData, error: refErr } = await Promise.race([refreshPromise, timeoutPromise]);
          if (refErr || !refData?.session?.user) {
            console.warn('[AuthContext] Refresh failed, signing out locally');
            purgeSupabaseTokens();
            setUser(null);
            setSession(null);
            setLoading(false);
            window.dispatchEvent(new Event('vocabmaster_vocabs_updated'));
            return;
          }
          setSession(refData.session);
          setUser(refData.session.user);
          await syncUserDataWithCloud(refData.session.user);
          setLoading(false);
          return;
        }

        setSession(session);
        setUser(session.user);
        await syncUserDataWithCloud(session.user);
      } catch (err) {
        console.warn('[AuthContext] initAuth catch:', err);
        purgeSupabaseTokens();
        setUser(null);
        setSession(null);
      } finally {
        setLoading(false);
      }
    };

    initAuth();

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      // Ignore USER_UPDATED and TOKEN_REFRESHED to break recursive push-sync loops
      if (event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED') {
        return;
      }

      if (event === 'SIGNED_OUT' || !newSession?.user) {
        setUser(null);
        setSession(null);
        setLoading(false);
        window.dispatchEvent(new Event('vocabmaster_vocabs_updated'));
        return;
      }

      setSession(newSession);
      setUser((prevUser) => {
        if (prevUser && newSession?.user && prevUser.id === newSession.user.id) {
          return prevUser;
        }
        return newSession.user;
      });
      setLoading(false);

      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        await syncUserDataWithCloud(newSession.user);

        // Migrate local data on first login
        const localVocabs = getLocalVocabs();
        if (localVocabs.length > 0) {
          const userId = newSession.user.id;
          const rows = localVocabs.map((v) => ({
            user_id: userId,
            word: v.word,
            type: v.type,
            meaning: v.meaning,
            category: v.category || 'General',
          }));
          const { error } = await supabase.from('vocabularies').insert(rows);
          if (!error) {
            clearLocalVocabs();
            window.dispatchEvent(new Event('vocabmaster_vocabs_updated'));
          }
        }
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (data?.user && data?.session) {
      setUser(data.user);
      setSession(data.session);
      await syncUserDataWithCloud(data.user);
      window.dispatchEvent(new Event('vocabmaster_vocabs_updated'));
    }
    return { error: error?.message ?? null };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    // 1. Instantly reset auth state in memory
    setUser(null);
    setSession(null);
    setLoading(false);

    // 2. Instantly wipe all Supabase auth storage tokens
    purgeSupabaseTokens();

    // 3. Notify components immediately
    window.dispatchEvent(new Event('vocabmaster_vocabs_updated'));

    // 4. Fire-and-forget server sign out without blocking UI
    try {
      await Promise.race([
        supabase.auth.signOut({ scope: 'local' }),
        new Promise((resolve) => setTimeout(resolve, 500)),
      ]);
    } catch {}
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    return { error: error?.message ?? null };
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signOut, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
