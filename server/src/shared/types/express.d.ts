import type { Types } from 'mongoose';

declare global {
  namespace Express {
    interface Request {
      authUser?: {
        userId: Types.ObjectId;
        walletAddress?: string;
      };
    }
  }
}

export {};
