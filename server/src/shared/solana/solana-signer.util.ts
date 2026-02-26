import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { env } from '@/config/env.config';
import { AppError } from '@/shared/errors/app-error';

let cachedEnvSigner: Keypair | null = null;

const parseSecretKey = (value: string): Uint8Array => {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new Error('WORKER_EXECUTOR_SECRET_KEY is required');
  }

  if (normalizedValue.startsWith('[')) {
    const parsed = JSON.parse(normalizedValue) as number[];
    return Uint8Array.from(parsed);
  }

  if (normalizedValue.includes(',')) {
    const parsed = normalizedValue.split(',').map((part) => Number(part.trim()));
    return Uint8Array.from(parsed);
  }

  return bs58.decode(normalizedValue);
};

export const getEnvSigner = (): Keypair => {
  if (cachedEnvSigner) {
    return cachedEnvSigner;
  }

  if (!env.WORKER_EXECUTOR_SECRET_KEY) {
    throw new AppError('WORKER_EXECUTOR_SECRET_KEY is not set', 500, 'WORKER_SIGNER_NOT_CONFIGURED');
  }

  try {
    const secretKey = parseSecretKey(env.WORKER_EXECUTOR_SECRET_KEY);
    cachedEnvSigner = Keypair.fromSecretKey(secretKey);
    return cachedEnvSigner;
  } catch (error) {
    throw new AppError(
      `Failed to parse WORKER_EXECUTOR_SECRET_KEY: ${error instanceof Error ? error.message : 'unknown error'}`,
      500,
      'WORKER_SIGNER_INVALID',
    );
  }
};
