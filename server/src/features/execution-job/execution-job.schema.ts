import { z } from 'zod';

const emptyObject = z.object({}).strip();

export const listExecutionJobSchema = z.object({
  body: emptyObject,
  params: emptyObject,
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(['pending', 'running', 'completed', 'failed']).optional(),
    daoId: z.string().trim().length(24).optional(),
  }),
});

export const scheduleExecutionJobSchema = z.object({
  body: emptyObject,
  params: z.object({
    proposalId: z.string().trim().length(24),
  }),
  query: emptyObject,
});

export const retryExecutionJobSchema = z.object({
  body: emptyObject,
  params: z.object({
    executionJobId: z.string().trim().length(24),
  }),
  query: emptyObject,
});
