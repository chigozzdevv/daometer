import type { NextFunction, Request, Response } from 'express';
import type { AnyZodObject, ZodEffects } from 'zod';
import { AppError } from '@/shared/errors/app-error';

type SupportedSchema = AnyZodObject | ZodEffects<AnyZodObject>;

export const validateRequest = (schema: SupportedSchema) => (req: Request, _res: Response, next: NextFunction): void => {
  const parseResult = schema.safeParse({
    body: req.body,
    params: req.params,
    query: req.query,
  });

  if (!parseResult.success) {
    next(new AppError('Validation failed', 400, 'VALIDATION_ERROR', parseResult.error.flatten()));
    return;
  }

  req.body = parseResult.data.body;
  req.params = parseResult.data.params;
  req.query = parseResult.data.query;
  next();
};
