import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react';
import { clearStoredSession, getStoredSession, setStoredSession, type StoredSession } from '@/shared/lib/session-storage';

type AuthContextValue = {
  session: StoredSession | null;
  isAuthenticated: boolean;
  signIn: (session: StoredSession) => void;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: PropsWithChildren): JSX.Element => {
  const [session, setSession] = useState<StoredSession | null>(() => getStoredSession());

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
