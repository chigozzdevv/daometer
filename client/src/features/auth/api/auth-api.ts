import { apiRequest } from '@/shared/lib/api-client';

type AuthApiResponse = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    fullName: string;
    email: string;
  };
};

type LoginInput = {
  email: string;
  password: string;
};

type RegisterInput = {
  fullName: string;
  email: string;
  password: string;
};

export const loginRequest = async (input: LoginInput): Promise<AuthApiResponse> =>
  apiRequest<AuthApiResponse>('/auth/login', {
    method: 'POST',
    body: input,
  });

export const registerRequest = async (input: RegisterInput): Promise<AuthApiResponse> =>
  apiRequest<AuthApiResponse>('/auth/register', {
    method: 'POST',
    body: input,
  });
