import { Types } from 'mongoose';
import BN from 'bn.js';
import bs58 from 'bs58';
import { randomBytes } from 'node:crypto';
import { PublicKey } from '@solana/web3.js';
import {
  Connection,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
  type Commitment,
} from '@solana/web3.js';
import {
  getAllGovernances,
  getNativeTreasuryAddress,
  getTokenOwnerRecordAddress,
  GovernanceConfig,
  MintMaxVoteWeightSource,
  VoteThreshold,
  VoteThresholdType,
  VoteTipping,
  withCreateGovernance,
  withCreateNativeTreasury,
  withCreateRealm,
  withCreateTokenOwnerRecord,
} from '@realms-today/spl-governance';
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
  defaultGovernanceAddress?: string;
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
  defaultGovernanceAddress?: string | null;
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

type PrepareCommunityMintInput = {
  name: string;
  network: 'mainnet-beta' | 'devnet';
  authorityWallet?: string;
  decimals: number;
  rpcUrl?: string;
};

type PrepareGovernanceCreateInput = {
  createAuthorityWallet?: string;
  voteScope: 'community' | 'council';
  governingTokenMint?: string;
  governanceConfig?: {
    communityYesVoteThresholdPercent?: number;
    councilYesVoteThresholdPercent?: number;
    councilVetoVoteThresholdPercent?: number;
    baseVotingTimeHours?: number;
    instructionHoldUpTimeHours?: number;
    voteTipping?: 'strict' | 'early' | 'disabled';
    councilVoteTipping?: 'strict' | 'early' | 'disabled';
  };
  rpcUrl?: string;
  programVersion: number;
};

type DaoGovernanceSummary = {
  address: string;
  governedAccount: string | null;
  nativeTreasuryAddress: string;
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

const defaultGovernanceProgramByNetwork: Record<'devnet' | 'mainnet-beta', string> = {
  devnet: 'GTesTBiEWE32WHXXE2S4XbZvA5CrEc4xs6ZgRe895dP',
  'mainnet-beta': SOLANA_PROGRAM_IDS.governanceProgram,
};

const TOKEN_MINT_ACCOUNT_SIZE = 82;

const buildTokenSymbol = (name: string): string => {
  const words = name
    .trim()
    .replace(/[^a-zA-Z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const initials = words.map((word) => word[0]?.toUpperCase() ?? '').join('');

  if (initials.length >= 2) {
    return initials.slice(0, 5);
  }

  const compact = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return (compact || 'DAO').slice(0, 5);
};

const buildMintSeed = (name: string): string => {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 18);
  const suffix = randomBytes(4).toString('hex');
  return `dm${base}${suffix}`.slice(0, 32);
};

export const createDao = async (input: CreateDaoInput, userId: Types.ObjectId): Promise<DaoDocument> => {
  const realmAddress = normalizeAddress(input.realmAddress, 'realm address');
  const governanceProgramId = normalizeAddress(input.governanceProgramId, 'governance program id');
  const defaultGovernanceAddress = input.defaultGovernanceAddress
    ? normalizeAddress(input.defaultGovernanceAddress, 'default governance address')
    : undefined;
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
    defaultGovernanceAddress,
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
  transactionBase58: string;
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
    : defaultGovernanceProgramByNetwork[input.network];
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
  const serializedTransaction = transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });
  const transactionMessage = bs58.encode(transaction.serializeMessage());
  const transactionBase58 = bs58.encode(serializedTransaction);
  const transactionBase64 = Buffer.from(serializedTransaction).toString('base64');

  return {
    transactionMessage,
    transactionBase58,
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

export const prepareCommunityMintCreate = async (
  input: PrepareCommunityMintInput,
  userId: Types.ObjectId,
): Promise<{
  transactionMessage: string;
  transactionBase58: string;
  transactionBase64: string;
  mintAddress: string;
  symbol: string;
  decimals: number;
  authorityWallet: string;
  payerWallet: string;
  seed: string;
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

  const rpcUrl = input.rpcUrl ?? defaultRpcByNetwork[input.network];
  const connection = new Connection(rpcUrl, { commitment: env.SOLANA_COMMITMENT as Commitment });
  const payerPubkey = new PublicKey(creatorWalletAddress);
  const authorityPubkey = new PublicKey(requestedAuthorityWallet);
  const tokenProgramPubkey = new PublicKey(SOLANA_PROGRAM_IDS.tokenProgram);
  const seed = buildMintSeed(input.name);
  const mintPubkey = await PublicKey.createWithSeed(payerPubkey, seed, tokenProgramPubkey);
  const symbol = buildTokenSymbol(input.name);
  const rentExemptLamports = await connection.getMinimumBalanceForRentExemption(TOKEN_MINT_ACCOUNT_SIZE);

  const createMintAccountIx = SystemProgram.createAccountWithSeed({
    fromPubkey: payerPubkey,
    newAccountPubkey: mintPubkey,
    basePubkey: payerPubkey,
    seed,
    lamports: rentExemptLamports,
    space: TOKEN_MINT_ACCOUNT_SIZE,
    programId: tokenProgramPubkey,
  });

  // SPL Token `InitializeMint` instruction layout:
  // [instruction=0, decimals, mintAuthority(32), freezeAuthorityOption(1), freezeAuthority(32)]
  const initializeMintData = Buffer.alloc(67);
  initializeMintData.writeUInt8(0, 0);
  initializeMintData.writeUInt8(input.decimals, 1);
  authorityPubkey.toBuffer().copy(initializeMintData, 2);
  initializeMintData.writeUInt8(0, 34);

  const initializeMintIx = new TransactionInstruction({
    programId: tokenProgramPubkey,
    keys: [
      { pubkey: mintPubkey, isSigner: false, isWritable: true },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: initializeMintData,
  });

  const transaction = new Transaction().add(createMintAccountIx, initializeMintIx);
  transaction.feePayer = payerPubkey;
  const latestBlockhash = await connection.getLatestBlockhash(env.SOLANA_COMMITMENT as Commitment);
  transaction.recentBlockhash = latestBlockhash.blockhash;
  const serializedTransaction = transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });
  const transactionMessage = bs58.encode(transaction.serializeMessage());
  const transactionBase58 = bs58.encode(serializedTransaction);
  const transactionBase64 = Buffer.from(serializedTransaction).toString('base64');

  return {
    transactionMessage,
    transactionBase58,
    transactionBase64,
    mintAddress: mintPubkey.toBase58(),
    symbol,
    decimals: input.decimals,
    authorityWallet: requestedAuthorityWallet,
    payerWallet: creatorWalletAddress,
    seed,
    rpcUrl,
    recentBlockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    network: input.network,
  };
};

const mapVoteTipping = (value: 'strict' | 'early' | 'disabled' | undefined): VoteTipping => {
  if (value === 'early') {
    return VoteTipping.Early;
  }

  if (value === 'disabled') {
    return VoteTipping.Disabled;
  }

  return VoteTipping.Strict;
};

const buildDefaultGovernanceConfig = (
  hasCouncil: boolean,
  overrides?: PrepareGovernanceCreateInput['governanceConfig'],
): GovernanceConfig => {
  const disabled = new VoteThreshold({
    type: VoteThresholdType.Disabled,
  });
  const communityYesVoteThreshold = new VoteThreshold({
    type: VoteThresholdType.YesVotePercentage,
    value: overrides?.communityYesVoteThresholdPercent ?? 60,
  });
  const councilYesVoteThreshold = new VoteThreshold({
    type: VoteThresholdType.YesVotePercentage,
    value: overrides?.councilYesVoteThresholdPercent ?? 60,
  });
  const councilVetoVoteThreshold = new VoteThreshold({
    type: VoteThresholdType.YesVotePercentage,
    value: overrides?.councilVetoVoteThresholdPercent ?? 50,
  });

  return new GovernanceConfig({
    communityVoteThreshold: communityYesVoteThreshold,
    minCommunityTokensToCreateProposal: new BN(1),
    minInstructionHoldUpTime: (overrides?.instructionHoldUpTimeHours ?? 0) * 60 * 60,
    baseVotingTime: (overrides?.baseVotingTimeHours ?? 72) * 60 * 60,
    communityVoteTipping: mapVoteTipping(overrides?.voteTipping),
    councilVoteThreshold: hasCouncil ? councilYesVoteThreshold : disabled,
    councilVetoVoteThreshold: hasCouncil ? councilVetoVoteThreshold : disabled,
    minCouncilTokensToCreateProposal: new BN(hasCouncil ? 1 : 0),
    councilVoteTipping: hasCouncil
      ? mapVoteTipping(overrides?.councilVoteTipping ?? overrides?.voteTipping)
      : VoteTipping.Strict,
    communityVetoVoteThreshold: disabled,
    votingCoolOffTime: 0,
    depositExemptProposalCount: 10,
  });
};

export const prepareGovernanceCreate = async (
  daoId: string,
  input: PrepareGovernanceCreateInput,
  userId: Types.ObjectId,
): Promise<{
  transactionMessage: string;
  transactionBase58: string;
  transactionBase64: string;
  governanceAddress: string;
  nativeTreasuryAddress: string;
  authorityWallet: string;
  governanceProgramId: string;
  realmAddress: string;
  governingTokenMint: string;
  rpcUrl: string;
  recentBlockhash: string;
  lastValidBlockHeight: number;
  network: 'mainnet-beta' | 'devnet';
}> => {
  const dao = await assertCanManageDao(daoId, userId);
  const creator = await UserModel.findById(userId).select('walletAddress roles');

  if (!creator?.walletAddress) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const creatorWalletAddress = normalizeAddress(creator.walletAddress, 'creator wallet');
  const requestedAuthorityWallet = input.createAuthorityWallet
    ? normalizeAddress(input.createAuthorityWallet, 'create authority wallet')
    : dao.authorityWallet;
  const isAdmin = creator.roles.includes('admin');

  if (!isAdmin && requestedAuthorityWallet !== creatorWalletAddress) {
    throw new AppError('Create authority wallet must match your connected wallet', 403, 'DAO_AUTHORITY_WALLET_MISMATCH');
  }

  if (requestedAuthorityWallet !== dao.authorityWallet) {
    throw new AppError(
      'Create authority must be the DAO authority wallet. Update DAO authority first if needed.',
      400,
      'DAO_GOVERNANCE_CREATE_AUTHORITY_INVALID',
    );
  }

  const governanceProgramId = normalizeAddress(dao.governanceProgramId, 'governance program id');
  const realmAddress = normalizeAddress(dao.realmAddress, 'realm address');
  const hasCouncil = Boolean(dao.councilMint);
  const voteScope = input.voteScope ?? 'community';
  const fallbackMint =
    voteScope === 'council'
      ? dao.councilMint
      : dao.communityMint;
  const governingTokenMint = input.governingTokenMint
    ? normalizeAddress(input.governingTokenMint, 'governing token mint')
    : fallbackMint;

  if (!governingTokenMint) {
    throw new AppError(
      voteScope === 'council'
        ? 'Council mint is missing for this DAO. Set council mint or use community scope.'
        : 'Community mint is missing for this DAO.',
      400,
      'DAO_GOVERNING_TOKEN_MINT_MISSING',
    );
  }

  const rpcUrl = input.rpcUrl ?? defaultRpcByNetwork[dao.network];
  const connection = new Connection(rpcUrl, { commitment: env.SOLANA_COMMITMENT as Commitment });
  const programIdPk = new PublicKey(governanceProgramId);
  const realmPk = new PublicKey(realmAddress);
  const payerPk = new PublicKey(creatorWalletAddress);
  const authorityPk = new PublicKey(requestedAuthorityWallet);
  const governingTokenMintPk = new PublicKey(governingTokenMint);
  const instructions: TransactionInstruction[] = [];

  const tokenOwnerRecordAddress = await getTokenOwnerRecordAddress(
    programIdPk,
    realmPk,
    governingTokenMintPk,
    authorityPk,
  );
  const tokenOwnerRecordAccount = await connection.getAccountInfo(
    tokenOwnerRecordAddress,
    env.SOLANA_COMMITMENT as Commitment,
  );

  if (!tokenOwnerRecordAccount) {
    await withCreateTokenOwnerRecord(
      instructions,
      programIdPk,
      input.programVersion,
      realmPk,
      authorityPk,
      governingTokenMintPk,
      payerPk,
    );
  }

  const governanceConfig = buildDefaultGovernanceConfig(hasCouncil, input.governanceConfig);
  const governanceAddress = await withCreateGovernance(
    instructions,
    programIdPk,
    input.programVersion,
    realmPk,
    undefined,
    governanceConfig,
    tokenOwnerRecordAddress,
    payerPk,
    authorityPk,
  );
  const nativeTreasuryAddress = await withCreateNativeTreasury(
    instructions,
    programIdPk,
    input.programVersion,
    governanceAddress,
    payerPk,
  );

  const transaction = new Transaction().add(...instructions);
  transaction.feePayer = payerPk;
  const latestBlockhash = await connection.getLatestBlockhash(env.SOLANA_COMMITMENT as Commitment);
  transaction.recentBlockhash = latestBlockhash.blockhash;
  const serializedTransaction = transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });
  const transactionMessage = bs58.encode(transaction.serializeMessage());
  const transactionBase58 = bs58.encode(serializedTransaction);
  const transactionBase64 = Buffer.from(serializedTransaction).toString('base64');

  return {
    transactionMessage,
    transactionBase58,
    transactionBase64,
    governanceAddress: governanceAddress.toBase58(),
    nativeTreasuryAddress: nativeTreasuryAddress.toBase58(),
    authorityWallet: requestedAuthorityWallet,
    governanceProgramId,
    realmAddress,
    governingTokenMint,
    rpcUrl,
    recentBlockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    network: dao.network,
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

export const listDaoGovernances = async (
  daoId: string,
  options: { rpcUrl?: string } = {},
): Promise<{
  daoId: string;
  realmAddress: string;
  governanceProgramId: string;
  network: 'mainnet-beta' | 'devnet';
  rpcUrl: string;
  items: DaoGovernanceSummary[];
}> => {
  const dao = await DaoModel.findById(daoId).select('network realmAddress governanceProgramId');

  if (!dao) {
    throw new AppError('DAO not found', 404, 'DAO_NOT_FOUND');
  }

  const rpcUrl = options.rpcUrl ?? defaultRpcByNetwork[dao.network];
  const connection = new Connection(rpcUrl, { commitment: env.SOLANA_COMMITMENT as Commitment });
  const programId = new PublicKey(dao.governanceProgramId);
  const realmAddress = new PublicKey(dao.realmAddress);

  const allGovernancesRaw = await getAllGovernances(connection, programId, realmAddress);
  const flattenedGovernances = Array.isArray(allGovernancesRaw)
    ? (allGovernancesRaw as Array<unknown>).flat()
    : [];

  const governanceRows = flattenedGovernances
    .map((governanceAccount) => {
      const pubkey = (governanceAccount as { pubkey?: PublicKey }).pubkey;
      const governedAccount = (governanceAccount as { account?: { governedAccount?: PublicKey | null } }).account
        ?.governedAccount;

      if (!(pubkey instanceof PublicKey)) {
        return null;
      }

      return {
        pubkey,
        governedAccount: governedAccount instanceof PublicKey ? governedAccount.toBase58() : null,
      };
    })
    .filter((value): value is { pubkey: PublicKey; governedAccount: string | null } => Boolean(value));

  const items = (
    await Promise.all(
      governanceRows.map(async (row) => {
        const nativeTreasuryAddress = await getNativeTreasuryAddress(programId, row.pubkey);

        return {
          address: row.pubkey.toBase58(),
          governedAccount: row.governedAccount,
          nativeTreasuryAddress: nativeTreasuryAddress.toBase58(),
        } satisfies DaoGovernanceSummary;
      }),
    )
  )
    .sort((left, right) => left.address.localeCompare(right.address));

  return {
    daoId,
    realmAddress: dao.realmAddress,
    governanceProgramId: dao.governanceProgramId,
    network: dao.network,
    rpcUrl,
    items,
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

  if (input.defaultGovernanceAddress !== undefined) {
    dao.defaultGovernanceAddress = input.defaultGovernanceAddress
      ? normalizeAddress(input.defaultGovernanceAddress, 'default governance address')
      : null;
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
