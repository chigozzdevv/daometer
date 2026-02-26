import { type HydratedDocument, model, Schema } from 'mongoose';

export type UserRole = 'member' | 'admin';

export interface User {
  fullName: string;
  email: string;
  passwordHash: string;
  roles: UserRole[];
  refreshTokenHash: string | null;
  refreshTokenExpiresAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<User>(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
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
        delete ret.passwordHash;
        delete ret.refreshTokenHash;
        return ret;
      },
    },
  },
);

export type UserDocument = HydratedDocument<User>;

export const UserModel = model<User>('User', userSchema);
