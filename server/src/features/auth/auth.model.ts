import { type HydratedDocument, model, Schema } from 'mongoose';

export type UserRole = 'member' | 'admin';

export interface User {
  walletAddress: string;
  displayName: string | null;
  roles: UserRole[];
  refreshTokenHash: string | null;
  refreshTokenExpiresAt: Date | null;
  authNonce: string | null;
  authNonceExpiresAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<User>(
  {
    walletAddress: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    displayName: {
      type: String,
      default: null,
      trim: true,
      maxlength: 120,
    },
    roles: {
      type: [String],
      default: ['member'],
    },
    refreshTokenHash: {
      type: String,
      select: false,
      default: null,
    },
    refreshTokenExpiresAt: {
      type: Date,
      default: null,
    },
    authNonce: {
      type: String,
      select: false,
      default: null,
    },
    authNonceExpiresAt: {
      type: Date,
      default: null,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform: (_doc, ret: any) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.refreshTokenHash;
        delete ret.authNonce;
        return ret;
      },
    },
  },
);

export type UserDocument = HydratedDocument<User>;

export const UserModel = model<User>('User', userSchema);
