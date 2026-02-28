import pino from 'pino';
import { env } from '@/config/env.config';

export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: [
    'req.headers.authorization',
    'req.headers.cookie',
    'res.headers["set-cookie"]',
    'password',
    'token',
    'accessToken',
    'refreshToken',
  ],
  transport:
    env.NODE_ENV === 'production'
      ? undefined
      : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
        },
      },
});
