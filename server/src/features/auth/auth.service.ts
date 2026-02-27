import bcrypt from 'bcryptjs';
import { createPublicKey, randomBytes, verify } from 'node:crypto';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import type { Types } from 'mongoose';
import { env } from '@/config/env.config';
import { AppError } from '@/shared/errors/app-error';
import { UserModel, type UserDocument } from '@/features/auth/auth.model';

type WalletChallengeInput = {
  walletAddress: string;
};

type VerifyWalletChallengeInput = {
  walletAddress: string;
  signatureBase64: string;
};

type WalletChallengeResponse = {
  walletAddress: string;
  message: string;
  expiresAt: string;
};

type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: UserDocument;
};

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

const normalizeWalletAddress = (walletAddress: string): string => {
  try {
    return new PublicKey(walletAddress.trim()).toBase58();
  } catch {
    throw new AppError('Invalid wallet address', 400, 'INVALID_WALLET_ADDRESS');
  }
};

const buildWalletChallengeMessage = (walletAddress: string, nonce: string, expiresAt: Date): string =>
  [
    'Sign this message to authenticate with Daometer.',
    '',
    `Wallet: ${walletAddress}`,
    `Nonce: ${nonce}`,
    `Expires At: ${expiresAt.toISOString()}`,
  ].join('\n');

const signAccessToken = (user: UserDocument): string => {
  const options: jwt.SignOptions = {
    subject: user.id,
    expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'],
  };

  return jwt.sign({ walletAddress: user.walletAddress }, env.JWT_ACCESS_SECRET, options);
};

const signRefreshToken = (user: UserDocument): string => {
  const options: jwt.SignOptions = {
    subject: user.id,
    expiresIn: env.JWT_REFRESH_TTL as jwt.SignOptions['expiresIn'],
  };

  return jwt.sign({ walletAddress: user.walletAddress }, env.JWT_REFRESH_SECRET, options);
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

const verifyWalletSignature = (walletAddress: string, message: string, signature: Buffer): boolean => {
  const publicKeyBytes = bs58.decode(walletAddress);

  if (publicKeyBytes.length !== 32) {
    return false;
  }

  const publicKey = createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKeyBytes)]),
    format: 'der',
    type: 'spki',
  });

  return verify(null, Buffer.from(message, 'utf8'), publicKey, signature);
};

export const createWalletChallenge = async (input: WalletChallengeInput): Promise<WalletChallengeResponse> => {
  const walletAddress = normalizeWalletAddress(input.walletAddress);
  const nonce = randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);

  const user = await UserModel.findOne({ walletAddress });

  if (user) {
    user.authNonce = nonce;
    user.authNonceExpiresAt = expiresAt;
    await user.save();
  } else {
    await UserModel.create({
      walletAddress,
      displayName: null,
      authNonce: nonce,
      authNonceExpiresAt: expiresAt,
    });
  }

  return {
    walletAddress,
    message: buildWalletChallengeMessage(walletAddress, nonce, expiresAt),
    expiresAt: expiresAt.toISOString(),
  };
};

export const verifyWalletChallenge = async (input: VerifyWalletChallengeInput): Promise<AuthResponse> => {
  const walletAddress = normalizeWalletAddress(input.walletAddress);
  const user = await UserModel.findOne({ walletAddress }).select('+authNonce +refreshTokenHash');

  if (!user || !user.authNonce || !user.authNonceExpiresAt) {
    throw new AppError('Challenge not found or expired. Request a new challenge.', 401, 'AUTH_CHALLENGE_MISSING');
  }

  if (user.authNonceExpiresAt.getTime() <= Date.now()) {
    user.authNonce = null;
    user.authNonceExpiresAt = null;
    await user.save();
    throw new AppError('Challenge expired. Request a new challenge.', 401, 'AUTH_CHALLENGE_EXPIRED');
  }

  let signature: Buffer;

  try {
    signature = Buffer.from(input.signatureBase64.trim(), 'base64');
  } catch {
    throw new AppError('Invalid signature encoding', 400, 'AUTH_SIGNATURE_INVALID');
  }

  if (signature.length === 0) {
    throw new AppError('Invalid signature payload', 400, 'AUTH_SIGNATURE_INVALID');
  }

  const expectedMessage = buildWalletChallengeMessage(walletAddress, user.authNonce, user.authNonceExpiresAt);
  const isValidSignature = verifyWalletSignature(walletAddress, expectedMessage, signature);

  if (!isValidSignature) {
    throw new AppError('Signature verification failed', 401, 'AUTH_SIGNATURE_INVALID');
  }

  user.authNonce = null;
  user.authNonceExpiresAt = null;
  await user.save();

  return issueSessionTokens(user);
};

export const refreshSession = async (refreshToken: string): Promise<AuthResponse> => {
  let payload: JwtPayload;

  try {
    payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as JwtPayload;
  } catch {
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
