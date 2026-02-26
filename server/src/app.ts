import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import pinoHttp from 'pino-http';
import { env } from '@/config/env.config';
import { logger } from '@/config/logger.config';
import { apiRouter } from '@/routes/index.routes';
import { errorHandler } from '@/shared/middlewares/error-handler.middleware';
import { notFoundHandler } from '@/shared/middlewares/not-found.middleware';

export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(pinoHttp({ logger }));

app.get('/health', (_req, res) => {
  const readyStates = ['disconnected', 'connected', 'connecting', 'disconnecting'];

  res.status(200).json({
    success: true,
    data: {
      service: 'daometer-backend',
      uptimeSeconds: process.uptime(),
      database: readyStates[mongoose.connection.readyState] ?? 'unknown',
      timestamp: new Date().toISOString(),
    },
  });
});

app.use(env.API_PREFIX, apiRouter);

app.use(notFoundHandler);
app.use(errorHandler);
