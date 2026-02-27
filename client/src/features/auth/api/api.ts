import { apiRequest } from '@/shared/lib/api-client';

type AuthApiResponse = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    walletAddress: string;
    displayName: string | null;
    roles: string[];
  };
};

export type WalletChallengeResponse = {
  walletAddress: string;
  message: string;
  expiresAt: string;
};

export const createWalletChallengeRequest = async (walletAddress: string): Promise<WalletChallengeResponse> =>
  apiRequest<WalletChallengeResponse>('/auth/challenge', {
    method: 'POST',
    body: { walletAddress },
  });

export const verifyWalletChallengeRequest = async (input: {
  walletAddress: string;
  signatureBase64: string;
}): Promise<AuthApiResponse> =>
  apiRequest<AuthApiResponse>('/auth/verify', {
    method: 'POST',
    body: input,
  });
