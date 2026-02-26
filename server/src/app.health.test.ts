import assert from 'node:assert/strict';
import test from 'node:test';

const setRequiredEnv = (): void => {
  process.env.NODE_ENV = 'test';
  process.env.PORT = '4001';
  process.env.API_PREFIX = '/api/v1';
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/daometer-test';
  process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
  process.env.SOLANA_COMMITMENT = 'confirmed';
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-which-is-long-enough-32';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-which-is-long-enough-32';
  process.env.WORKER_POLL_INTERVAL_MS = '4000';
  process.env.WORKER_MAX_JOBS_PER_TICK = '10';
  process.env.WORKER_LOCK_TIMEOUT_MS = '120000';
  process.env.WORKER_MAX_RETRIES = '5';
  process.env.WORKER_RETRY_DELAY_MS = '10000';
  process.env.AUTO_EXECUTION_DEFAULT_RISK_SCORE = '70';
};

test('GET /health responds with service metadata', async () => {
  setRequiredEnv();

  const { app } = await import('@/app');
  const healthLayer = ((app as unknown as { _router?: { stack?: Array<unknown> } })._router?.stack ?? []).find((layer) => {
    const routeLayer = layer as { route?: { path?: string; methods?: { get?: boolean } } };
    return routeLayer.route?.path === '/health' && routeLayer.route.methods?.get;
  }) as
    | {
        route: {
          stack: Array<{
            handle: (req: Record<string, unknown>, res: Record<string, unknown>) => void;
          }>;
        };
      }
    | undefined;

  assert.ok(healthLayer, 'health route should be registered');

  const response = {
    statusCode: 0,
    body: undefined as
      | {
          success: boolean;
          data: {
            service: string;
            database: string;
          };
        }
      | undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: {
      success: boolean;
      data: {
        service: string;
        database: string;
      };
    }) {
      this.body = payload;
      return this;
    },
  };

  healthLayer.route.stack[0]?.handle({}, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body?.success, true);
  assert.equal(response.body?.data.service, 'daometer-backend');
  assert.equal(response.body?.data.database, 'disconnected');
});
