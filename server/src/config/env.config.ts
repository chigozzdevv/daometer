import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const optionalStringFromEnv = () =>
  z.preprocess((value) => {
    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }, z.string().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_PREFIX: z.string().trim().min(1).default('/api/v1'),
  MONGODB_URI: z.string().trim().min(1),
  SOLANA_RPC_URL: z.string().trim().url().default('https://api.devnet.solana.com'),
  SOLANA_COMMITMENT: z.enum(['processed', 'confirmed', 'finalized']).default('confirmed'),
  WORKER_EXECUTOR_SECRET_KEY: optionalStringFromEnv(),
  WORKER_SIMULATE_BEFORE_EXECUTE: z.coerce.boolean().default(true),
  JWT_ACCESS_SECRET: z.string().trim().min(32),
  JWT_REFRESH_SECRET: z.string().trim().min(32),
  JWT_ACCESS_TTL: z.string().trim().min(2).default('15m'),
  JWT_REFRESH_TTL: z.string().trim().min(2).default('7d'),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(8).max(15).default(12),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(1000).default(4000),
  WORKER_MAX_JOBS_PER_TICK: z.coerce.number().int().min(1).max(100).default(10),
  WORKER_LOCK_TIMEOUT_MS: z.coerce.number().int().min(1000).default(120000),
  WORKER_MAX_RETRIES: z.coerce.number().int().min(1).max(20).default(5),
  WORKER_RETRY_DELAY_MS: z.coerce.number().int().min(1000).default(10000),
  AUTO_EXECUTION_DEFAULT_RISK_SCORE: z.coerce.number().int().min(0).max(100).default(70),
  RESEND_API_KEY: optionalStringFromEnv(),
  RESEND_FROM_EMAIL: z.preprocess(
    (value) => {
      if (typeof value !== 'string') {
        return value;
      }

      const trimmed = value.trim();
      return trimmed.length === 0 ? undefined : trimmed;
    },
    z.string().email().optional(),
  ),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  throw new Error(`Invalid environment variables: ${JSON.stringify(parsedEnv.error.flatten().fieldErrors)}`);
}

export const env = parsedEnv.data;
