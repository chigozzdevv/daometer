import { app } from '@/app';
import { connectDatabase, disconnectDatabase } from '@/config/database.config';
import { env } from '@/config/env.config';
import { logger } from '@/config/logger.config';

let isShuttingDown = false;

const bootstrap = async (): Promise<void> => {
  await connectDatabase();

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, prefix: env.API_PREFIX }, 'API server started');
  });

  const shutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    logger.info({ signal }, 'Graceful shutdown started');

    server.close(async (error?: Error) => {
      if (error) {
        logger.error({ err: error }, 'Failed to close server cleanly');
      }

      await disconnectDatabase();
      process.exit(error ? 1 : 0);
    });
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
};

bootstrap().catch((error: unknown) => {
  logger.error({ err: error }, 'Server bootstrap failed');
  process.exit(1);
});
