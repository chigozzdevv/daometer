import { Types } from 'mongoose';
import BN from 'bn.js';
import bs58 from 'bs58';
import { PublicKey } from '@solana/web3.js';
import { Connection, Transaction, type Commitment, type TransactionInstruction } from '@solana/web3.js';
import { MintMaxVoteWeightSource, withCreateRealm } from '@realms-today/spl-governance';
import { env } from '@/config/env.config';
import { UserModel } from '@/features/auth/auth.model';
import { DaoModel, type DaoDocument } from '@/features/dao/dao.model';
import { AppError } from '@/shared/errors/app-error';
import { SOLANA_PROGRAM_IDS } from '@/config/solana.config';
import { toSlug } from '@/shared/utils/slug.util';
import { assertCanManageDao } from '@/shared/utils/authorization.util';

type CreateDaoInput = {
  name: string;
  description?: string;
  network: 'mainnet-beta' | 'devnet';
  realmAddress: string;
  governanceProgramId: string;
  authorityWallet: string;
  communityMint?: string;
  councilMint?: string;
  slug?: string;
  automationConfig?: {
    autoExecuteEnabled?: boolean;
    maxRiskScore?: number;
    requireSimulation?: boolean;
  };
};

type UpdateDaoInput = {
  name?: string;
  description?: string;
  automationConfig?: {
    autoExecuteEnabled?: boolean;
    maxRiskScore?: number;
    requireSimulation?: boolean;
  };
};

type PrepareDaoOnchainCreateInput = {
  name: string;
  network: 'mainnet-beta' | 'devnet';
  communityMint: string;
  councilMint?: string;
  governanceProgramId?: string;
  authorityWallet?: string;
  rpcUrl?: string;
  programVersion: number;
};

const normalizeAddress = (address: string, fieldName: string): string => {
  try {
    return new PublicKey(address).toBase58();
  } catch {
    throw new AppError(`Invalid ${fieldName}`, 400, 'INVALID_DAO_ADDRESS');
  }
};

const defaultRpcByNetwork: Record<'devnet' | 'mainnet-beta', string> = {
  devnet: 'https://api.devnet.solana.com',
  'mainnet-beta': 'https://api.mainnet-beta.solana.com',
};

export const createDao = async (input: CreateDaoInput, userId: Types.ObjectId): Promise<DaoDocument> => {
  const realmAddress = normalizeAddress(input.realmAddress, 'realm address');
  const governanceProgramId = normalizeAddress(input.governanceProgramId, 'governance program id');
  const authorityWallet = normalizeAddress(input.authorityWallet, 'authority wallet');
  const communityMint = input.communityMint ? normalizeAddress(input.communityMint, 'community mint') : undefined;
  const councilMint = input.councilMint ? normalizeAddress(input.councilMint, 'council mint') : undefined;

  const creator = await UserModel.findById(userId).select('walletAddress roles');

  if (!creator) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const isAdmin = creator.roles.includes('admin');

  if (!isAdmin && creator.walletAddress !== authorityWallet) {
    throw new AppError('Authority wallet must match your connected wallet', 403, 'DAO_AUTHORITY_WALLET_MISMATCH');
  }

  const slug = input.slug ? toSlug(input.slug) : toSlug(input.name);

  const existingDao = await DaoModel.findOne({ $or: [{ slug }, { realmAddress }] });

  if (existingDao) {
    if (existingDao.slug === slug) {
      throw new AppError('DAO slug already exists', 409, 'DAO_SLUG_EXISTS');
    }

    throw new AppError('DAO realm address already exists', 409, 'DAO_REALM_EXISTS');
  }

  return DaoModel.create({
    name: input.name,
    slug,
    description: input.description ?? '',
    network: input.network,
    realmAddress,
    governanceProgramId,
    authorityWallet,
    communityMint,
    councilMint,
    createdBy: userId,
    automationConfig: {
      autoExecuteEnabled: input.automationConfig?.autoExecuteEnabled ?? true,
      maxRiskScore: input.automationConfig?.maxRiskScore ?? env.AUTO_EXECUTION_DEFAULT_RISK_SCORE,
      requireSimulation: input.automationConfig?.requireSimulation ?? true,
    },
  });
};

export const prepareDaoOnchainCreate = async (
  input: PrepareDaoOnchainCreateInput,
  userId: Types.ObjectId,
): Promise<{
  transactionMessage: string;
  transactionBase64: string;
  realmAddress: string;
  authorityWallet: string;
  governanceProgramId: string;
  rpcUrl: string;
  recentBlockhash: string;
  lastValidBlockHeight: number;
  network: 'mainnet-beta' | 'devnet';
}> => {
  const creator = await UserModel.findById(userId).select('walletAddress roles');

  if (!creator?.walletAddress) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const creatorWalletAddress = normalizeAddress(creator.walletAddress, 'creator wallet');
  const requestedAuthorityWallet = input.authorityWallet
    ? normalizeAddress(input.authorityWallet, 'authority wallet')
    : creatorWalletAddress;
  const isAdmin = creator.roles.includes('admin');

  if (!isAdmin && requestedAuthorityWallet !== creatorWalletAddress) {
    throw new AppError('Authority wallet must match your connected wallet', 403, 'DAO_AUTHORITY_WALLET_MISMATCH');
  }

  const governanceProgramId = input.governanceProgramId
    ? normalizeAddress(input.governanceProgramId, 'governance program id')
    : SOLANA_PROGRAM_IDS.governanceProgram;
  const communityMint = normalizeAddress(input.communityMint, 'community mint');
  const councilMint = input.councilMint ? normalizeAddress(input.councilMint, 'council mint') : undefined;
  const rpcUrl = input.rpcUrl ?? defaultRpcByNetwork[input.network];
  const connection = new Connection(rpcUrl, { commitment: env.SOLANA_COMMITMENT as Commitment });
  const feePayer = new PublicKey(creatorWalletAddress);
  const instructions: TransactionInstruction[] = [];

  const realmAddress = await withCreateRealm(
    instructions,
    new PublicKey(governanceProgramId),
    input.programVersion,
    input.name,
    new PublicKey(requestedAuthorityWallet),
    new PublicKey(communityMint),
    feePayer,
    councilMint ? new PublicKey(councilMint) : undefined,
    MintMaxVoteWeightSource.FULL_SUPPLY_FRACTION,
    new BN(1),
  );

  const transaction = new Transaction().add(...instructions);
  transaction.feePayer = feePayer;
  const latestBlockhash = await connection.getLatestBlockhash(env.SOLANA_COMMITMENT as Commitment);
  transaction.recentBlockhash = latestBlockhash.blockhash;
  const transactionMessage = bs58.encode(transaction.serializeMessage());
  const transactionBase64 = transaction
    .serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    })
    .toString('base64');

  return {
    transactionMessage,
    transactionBase64,
    realmAddress: realmAddress.toBase58(),
    authorityWallet: requestedAuthorityWallet,
    governanceProgramId,
    rpcUrl,
    recentBlockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    network: input.network,
  };
};

export const listDaos = async ({ page, limit, search }: { page: number; limit: number; search?: string }) => {
  const filter = search
    ? {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { slug: { $regex: search, $options: 'i' } },
          { realmAddress: { $regex: search, $options: 'i' } },
        ],
      }
    : {};

  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    DaoModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    DaoModel.countDocuments(filter),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const getDaoById = async (daoId: string): Promise<DaoDocument> => {
  const dao = await DaoModel.findById(daoId);

  if (!dao) {
    throw new AppError('DAO not found', 404, 'DAO_NOT_FOUND');
  }

  return dao;
};

export const updateDao = async (daoId: string, input: UpdateDaoInput, userId: Types.ObjectId): Promise<DaoDocument> => {
  const dao = await assertCanManageDao(daoId, userId);

  if (input.name) {
    dao.name = input.name;
  }

  if (input.description !== undefined) {
    dao.description = input.description;
  }

  if (input.automationConfig) {
    dao.automationConfig = {
      autoExecuteEnabled: input.automationConfig.autoExecuteEnabled ?? dao.automationConfig.autoExecuteEnabled,
      maxRiskScore: input.automationConfig.maxRiskScore ?? dao.automationConfig.maxRiskScore,
      requireSimulation: input.automationConfig.requireSimulation ?? dao.automationConfig.requireSimulation,
    };
  }

  await dao.save();
  return dao;
};
