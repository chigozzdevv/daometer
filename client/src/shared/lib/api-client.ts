const DEFAULT_API_BASE_URL = 'http://localhost:4000/api/v1';

const trimTrailingSlash = (value: string): string => value.replace(/\/$/, '');

export const apiBaseUrl = trimTrailingSlash(import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL);

type AuthExpiredHandler = () => void;
let authExpiredHandler: AuthExpiredHandler | null = null;

type SessionUpdate = {
  accessToken: string;
  refreshToken: string;
};
type SessionUpdateHandler = (session: SessionUpdate) => void;
let sessionUpdateHandler: SessionUpdateHandler | null = null;
let refreshPromise: Promise<SessionUpdate | null> | null = null;

export const setAuthExpiredHandler = (handler: AuthExpiredHandler | null): void => {
  authExpiredHandler = handler;
};

export const setAuthSessionUpdateHandler = (handler: SessionUpdateHandler | null): void => {
  sessionUpdateHandler = handler;
};

export class ApiRequestError extends Error {
  status: number;
  code: string | null;
  details: unknown;

  constructor(message: string, status: number, code: string | null, details?: unknown) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.details = details ?? null;
  }
}

type ApiRequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: Record<string, unknown>;
  accessToken?: string;
  skipAuthRefresh?: boolean;
};

const readStoredSession = (): SessionUpdate | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const accessToken = window.localStorage.getItem('daometer.access-token');
  const refreshToken = window.localStorage.getItem('daometer.refresh-token');

  if (!accessToken || !refreshToken) {
    return null;
  }

  return { accessToken, refreshToken };
};

const runRefreshSession = async (): Promise<SessionUpdate | null> => {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const currentSession = readStoredSession();

    if (!currentSession?.refreshToken) {
      return null;
    }

    const response = await fetch(`${apiBaseUrl}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken: currentSession.refreshToken }),
    });

    const payload = (await response.json().catch(() => null)) as
      | {
          success?: boolean;
          data?: {
            accessToken?: string;
            refreshToken?: string;
          };
        }
      | null;

    if (!response.ok || !payload?.success || !payload.data?.accessToken || !payload.data?.refreshToken) {
      return null;
    }

    const nextSession: SessionUpdate = {
      accessToken: payload.data.accessToken,
      refreshToken: payload.data.refreshToken,
    };

    sessionUpdateHandler?.(nextSession);
    return nextSession;
  })()
    .catch(() => null)
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
};

export const apiRequest = async <TResponse>(path: string, options: ApiRequestOptions = {}): Promise<TResponse> => {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        success?: boolean;
        data?: TResponse;
        error?: {
          message?: string;
          code?: string;
          details?: unknown;
        };
      }
    | null;

  if (!response.ok || !payload?.success || !('data' in payload) || payload.data === undefined) {
    const message = payload?.error?.message ?? 'Request failed';
    const code = payload?.error?.code ?? null;
    const details = payload?.error?.details ?? null;

    const shouldAttemptRefresh =
      Boolean(options.accessToken) &&
      !options.skipAuthRefresh &&
      path !== '/auth/refresh' &&
      response.status === 401 &&
      (code === 'UNAUTHORIZED' || message.toLowerCase().includes('expired token'));

    if (shouldAttemptRefresh) {
      const refreshed = await runRefreshSession();

      if (refreshed?.accessToken) {
        return apiRequest<TResponse>(path, {
          ...options,
          accessToken: refreshed.accessToken,
          skipAuthRefresh: true,
        });
      }

      authExpiredHandler?.();
    }

    throw new ApiRequestError(message, response.status, code, details);
  }

  return payload.data;
};
