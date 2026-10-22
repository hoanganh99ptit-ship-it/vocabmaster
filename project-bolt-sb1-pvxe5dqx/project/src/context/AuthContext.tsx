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

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        await syncUserDataWithCloud(data.session.user);
      }
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      // Ignore USER_UPDATED and TOKEN_REFRESHED to break recursive push-sync loops
      if (event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED') {
        return;
      }

      setSession(newSession);
      setUser(newSession?.user ?? null);
      setLoading(false);

      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        if (newSession?.user) {
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
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (data?.user) {
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
    await supabase.auth.signOut();
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
