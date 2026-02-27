const DEFAULT_API_BASE_URL = 'http://localhost:4000/api/v1';

const trimTrailingSlash = (value: string): string => value.replace(/\/$/, '');

export const apiBaseUrl = trimTrailingSlash(import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL);

export class ApiRequestError extends Error {
  status: number;
  code: string | null;

  constructor(message: string, status: number, code: string | null) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
  }
}

type ApiRequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: Record<string, unknown>;
  accessToken?: string;
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
        };
      }
    | null;

  if (!response.ok || !payload?.success || !('data' in payload) || payload.data === undefined) {
    const message = payload?.error?.message ?? 'Request failed';
    const code = payload?.error?.code ?? null;
    throw new ApiRequestError(message, response.status, code);
  }

  return payload.data;
};
