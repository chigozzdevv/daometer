import { z } from 'zod';

const emptyObject = z.object({}).strip();
const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export const createChallengeSchema = z.object({
  body: z.object({
    walletAddress: z.string().trim().regex(base58Regex, 'Invalid wallet address'),
  }),
  params: emptyObject,
  query: emptyObject,
});

export const verifyChallengeSchema = z.object({
  body: z.object({
    walletAddress: z.string().trim().regex(base58Regex, 'Invalid wallet address'),
    signatureBase64: z.string().trim().min(20),
  }),
  params: emptyObject,
  query: emptyObject,
});

export const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().trim().min(20),
  }),
  params: emptyObject,
  query: emptyObject,
});
