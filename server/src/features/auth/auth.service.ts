import bcrypt from 'bcryptjs';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import type { Types } from 'mongoose';
import { env } from '@/config/env.config';
import { AppError } from '@/shared/errors/app-error';
import { UserModel, type UserDocument } from '@/features/auth/auth.model';

type RegisterInput = {
  fullName: string;
  email: string;
  password: string;
};

type LoginInput = {
  email: string;
  password: string;
};

type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: UserDocument;
};

const signAccessToken = (user: UserDocument): string => {
  const options: jwt.SignOptions = {
    subject: user.id,
    expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'],
  };

  return jwt.sign({ email: user.email }, env.JWT_ACCESS_SECRET, options);
};

const signRefreshToken = (user: UserDocument): string => {
  const options: jwt.SignOptions = {
    subject: user.id,
    expiresIn: env.JWT_REFRESH_TTL as jwt.SignOptions['expiresIn'],
  };

  return jwt.sign({ email: user.email }, env.JWT_REFRESH_SECRET, options);
};

const toExpiryDate = (token: string): Date | null => {
  const decoded = jwt.decode(token) as JwtPayload | null;
  if (!decoded?.exp) {
    return null;
  }

  return new Date(decoded.exp * 1000);
};

const issueSessionTokens = async (user: UserDocument): Promise<AuthResponse> => {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  const refreshTokenHash = await bcrypt.hash(refreshToken, env.BCRYPT_SALT_ROUNDS);

  user.refreshTokenHash = refreshTokenHash;
  user.refreshTokenExpiresAt = toExpiryDate(refreshToken);
  user.lastLoginAt = new Date();
  await user.save();

  return {
    accessToken,
    refreshToken,
    user,
  };
};

export const registerUser = async (input: RegisterInput): Promise<AuthResponse> => {
  const existingUser = await UserModel.findOne({ email: input.email.toLowerCase() });

  if (existingUser) {
    throw new AppError('Email already registered', 409, 'EMAIL_IN_USE');
  }

  const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_SALT_ROUNDS);

  const createdUser = await UserModel.create({
    fullName: input.fullName,
    email: input.email.toLowerCase(),
    passwordHash,
  });

  const user = await UserModel.findById(createdUser.id).select('+refreshTokenHash');

  if (!user) {
    throw new AppError('Unable to register user', 500, 'REGISTRATION_FAILED');
  }

  return issueSessionTokens(user);
};

export const loginUser = async (input: LoginInput): Promise<AuthResponse> => {
  const user = await UserModel.findOne({ email: input.email.toLowerCase() }).select('+passwordHash +refreshTokenHash');

  if (!user?.passwordHash) {
    throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }

  const isPasswordValid = await bcrypt.compare(input.password, user.passwordHash);

  if (!isPasswordValid) {
    throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }

  return issueSessionTokens(user);
};

export const refreshSession = async (refreshToken: string): Promise<AuthResponse> => {
  let payload: JwtPayload;

  try {
    payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as JwtPayload;
  } catch (_error) {
    throw new AppError('Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
  }

  const userId = payload.sub;

  if (!userId) {
    throw new AppError('Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
  }

  const user = await UserModel.findById(userId).select('+refreshTokenHash');

  if (!user?.refreshTokenHash) {
    throw new AppError('Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
  }

  if (user.refreshTokenExpiresAt && user.refreshTokenExpiresAt.getTime() <= Date.now()) {
    throw new AppError('Refresh token expired', 401, 'REFRESH_TOKEN_EXPIRED');
  }

  const isTokenMatch = await bcrypt.compare(refreshToken, user.refreshTokenHash);

  if (!isTokenMatch) {
    throw new AppError('Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
  }

  return issueSessionTokens(user);
};

export const getUserProfile = async (userId: Types.ObjectId): Promise<UserDocument> => {
  const user = await UserModel.findById(userId);

  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  return user;
};
