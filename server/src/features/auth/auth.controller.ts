import type { Request, Response } from 'express';
import { asyncHandler } from '@/shared/utils/async-handler.util';
import { AppError } from '@/shared/errors/app-error';
import { getUserProfile, loginUser, refreshSession, registerUser } from '@/features/auth/auth.service';

export const register = asyncHandler(async (req: Request, res: Response) => {
  const result = await registerUser(req.body);

  res.status(201).json({
    success: true,
    data: result,
  });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const result = await loginUser(req.body);

  res.status(200).json({
    success: true,
    data: result,
  });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const result = await refreshSession(req.body.refreshToken);

  res.status(200).json({
    success: true,
    data: result,
  });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const user = await getUserProfile(req.authUser.userId);

  res.status(200).json({
    success: true,
    data: user,
  });
});
