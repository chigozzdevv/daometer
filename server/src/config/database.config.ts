import mongoose from 'mongoose';
import { env } from '@/config/env.config';
import { logger } from '@/config/logger.config';

export const connectDatabase = async (): Promise<void> => {
  await mongoose.connect(env.MONGODB_URI, {
    autoIndex: true,
  });

  logger.info({ uri: env.MONGODB_URI }, 'Database connected');
};

export const disconnectDatabase = async (): Promise<void> => {
  await mongoose.disconnect();
  logger.info('Database disconnected');
};
