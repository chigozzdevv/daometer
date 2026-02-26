import type { NextFunction, Request, Response } from 'express';

export const asyncHandler =
  <TRequest extends Request = Request>(
    handler: (req: TRequest, res: Response, next: NextFunction) => Promise<void>,
  ) =>
  (req: TRequest, res: Response, next: NextFunction): void => {
    handler(req, res, next).catch(next);
  };
