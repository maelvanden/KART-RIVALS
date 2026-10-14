import type { Session } from '@supabase/supabase-js';
import { createContext, use, useEffect, useState, type PropsWithChildren } from 'react';

import { demoProfile, isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';

type AuthState = {
  isLoading: boolean;
  userId: string | null;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(!isDemoMode);

  useEffect(() => {
    if (isDemoMode) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const value: AuthState = {
    isLoading,
    userId: isDemoMode ? demoProfile.id : (session?.user.id ?? null),
    signOut: async () => {
      if (!isDemoMode) await supabase.auth.signOut();
    },
  };

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const ctx = use(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
