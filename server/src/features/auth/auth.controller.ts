import type { Request, Response } from 'express';
import { asyncHandler } from '@/shared/utils/async-handler.util';
import { AppError } from '@/shared/errors/app-error';
import {
  createWalletChallenge,
  getUserProfile,
  refreshSession,
  verifyWalletChallenge,
} from '@/features/auth/auth.service';

export const challenge = asyncHandler(async (req: Request, res: Response) => {
  const result = await createWalletChallenge(req.body);

  res.status(200).json({
    success: true,
    data: result,
  });
});

export const verify = asyncHandler(async (req: Request, res: Response) => {
  const result = await verifyWalletChallenge(req.body);

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
