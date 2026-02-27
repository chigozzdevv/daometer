import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { clearStoredSession, getStoredSession, setStoredSession, type StoredSession } from '@/shared/lib/session-storage';
import { setAuthExpiredHandler } from '@/shared/lib/api-client';

type AuthContextValue = {
  session: StoredSession | null;
  isAuthenticated: boolean;
  signIn: (session: StoredSession) => void;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: PropsWithChildren): JSX.Element => {
  const [session, setSession] = useState<StoredSession | null>(() => getStoredSession());

  useEffect(() => {
    const handleAuthExpired = (): void => {
      clearStoredSession();
      setSession(null);

      if (typeof window !== 'undefined' && window.location.pathname !== '/auth') {
        window.location.assign('/auth?mode=login');
      }
    };

    setAuthExpiredHandler(handleAuthExpired);

    return () => {
      setAuthExpiredHandler(null);
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isAuthenticated: Boolean(session?.accessToken),
      signIn: (nextSession) => {
        setStoredSession(nextSession);
        setSession(nextSession);
      },
      signOut: () => {
        clearStoredSession();
        setSession(null);
      },
    }),
    [session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
};
