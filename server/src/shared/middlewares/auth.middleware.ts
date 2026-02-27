import type { NextFunction, Request, Response } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { Types } from 'mongoose';
import { env } from '@/config/env.config';
import { AppError } from '@/shared/errors/app-error';

type AuthTokenPayload = JwtPayload & {
  sub: string;
  walletAddress?: string;
};

export const requireAuth = (req: Request, _res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next(new AppError('Authorization token missing', 401, 'UNAUTHORIZED'));
    return;
  }

  const token = authHeader.replace('Bearer ', '').trim();

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AuthTokenPayload;

    if (!payload.sub || !Types.ObjectId.isValid(payload.sub)) {
      next(new AppError('Invalid token payload', 401, 'UNAUTHORIZED'));
      return;
    }

    req.authUser = {
      userId: new Types.ObjectId(payload.sub),
      walletAddress: payload.walletAddress,
    };

    next();
  } catch (_error) {
    next(new AppError('Invalid or expired token', 401, 'UNAUTHORIZED'));
  }
};
