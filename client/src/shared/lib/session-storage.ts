const ACCESS_TOKEN_KEY = 'daometer.access-token';
const REFRESH_TOKEN_KEY = 'daometer.refresh-token';

export type StoredSession = {
  accessToken: string;
  refreshToken: string;
};

export const getStoredSession = (): StoredSession | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const accessToken = window.localStorage.getItem(ACCESS_TOKEN_KEY);
  const refreshToken = window.localStorage.getItem(REFRESH_TOKEN_KEY);

  if (!accessToken || !refreshToken) {
    return null;
  }

  return {
    accessToken,
    refreshToken,
  };
};

export const setStoredSession = (session: StoredSession): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(ACCESS_TOKEN_KEY, session.accessToken);
  window.localStorage.setItem(REFRESH_TOKEN_KEY, session.refreshToken);
};

export const clearStoredSession = (): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
};
