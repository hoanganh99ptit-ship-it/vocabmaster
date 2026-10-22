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

        // Validate session with Supabase server to detect expired or stale tokens
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData?.user) {
          console.warn('[AuthContext] Stale or invalid session detected on server:', userError);
          try {
            await supabase.auth.signOut({ scope: 'local' });
          } catch {}
          purgeSupabaseTokens();
          setUser(null);
          setSession(null);
          setLoading(false);
          window.dispatchEvent(new Event('vocabmaster_vocabs_updated'));
          return;
        }

        setSession(data.session);
        setUser(userData.user);
        await syncUserDataWithCloud(userData.user);
      } catch (err) {
        console.warn('[AuthContext] initAuth catch:', err);
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
      setUser(newSession.user);
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
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('[AuthContext] signOut remote error:', err);
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch {}
    } finally {
      purgeSupabaseTokens();
      setUser(null);
      setSession(null);
      window.dispatchEvent(new Event('vocabmaster_vocabs_updated'));
    }
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
