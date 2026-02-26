import { z } from 'zod';

const emptyObject = z.object({}).strip();

export const syncExecutionQueueSchema = z.object({
  body: emptyObject,
  params: emptyObject,
  query: emptyObject,
});

export const processNextExecutionSchema = z.object({
  body: emptyObject,
  params: emptyObject,
  query: emptyObject,
});
