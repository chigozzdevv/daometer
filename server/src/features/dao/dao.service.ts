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
  withDepositGoverningTokens,
  withCreateGovernance,
  withCreateNativeTreasury,
  withCreateRealm,
  withCreateTokenOwnerRecord,
  withSetGovernanceDelegate,
  withWithdrawGoverningTokens,
} from '@realms-today/spl-governance';
import { env } from '@/config/env.config';
import { UserModel } from '@/features/auth/auth.model';
import { DaoModel, type DaoDocument } from '@/features/dao/dao.model';
import { AppError } from '@/shared/errors/app-error';
import { SOLANA_PROGRAM_IDS } from '@/config/solana.config';
import { prepareUnsignedTransaction } from '@/shared/solana/prepared-transaction.util';
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

type PrepareMintDistributionInput = {
  mintAddress: string;
  recipientWallet: string;
  amount: string;
  decimals: number;
  authorityWallet?: string;
  payerWallet?: string;
  createAssociatedTokenAccount: boolean;
  rpcUrl?: string;
};

type PrepareMintAuthorityInput = {
  mintAddress: string;
  currentAuthorityWallet?: string;
  newAuthorityWallet?: string | null;
  rpcUrl?: string;
};

type PrepareVotingDepositInput = {
  voteScope: 'community' | 'council';
  governingTokenMint?: string;
  amount: string;
  decimals: number;
  tokenSourceAccount?: string;
  governingTokenOwnerWallet?: string;
  payerWallet?: string;
  rpcUrl?: string;
  programVersion: number;
};

type PrepareVotingWithdrawInput = {
  voteScope: 'community' | 'council';
  governingTokenMint?: string;
  destinationTokenAccount?: string;
  governingTokenOwnerWallet?: string;
  payerWallet?: string;
  createDestinationAta: boolean;
  rpcUrl?: string;
  programVersion: number;
};

type PrepareVotingDelegateInput = {
  voteScope: 'community' | 'council';
  governingTokenMint?: string;
  governingTokenOwnerWallet?: string;
  newDelegateWallet?: string | null;
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

const maxU64 = (1n << 64n) - 1n;

const toU64BaseUnits = (amount: string, decimals: number): bigint => {
  if (!/^\d+(\.\d+)?$/.test(amount.trim())) {
    throw new AppError('Amount is invalid', 400, 'DAO_TOKEN_AMOUNT_INVALID');
  }

  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new AppError('Decimals must be between 0 and 18', 400, 'DAO_TOKEN_DECIMALS_INVALID');
  }

  const [wholePartRaw, fractionRaw = ''] = amount.trim().split('.');
  const wholePart = wholePartRaw === '' ? '0' : wholePartRaw;

  if (fractionRaw.length > decimals) {
    throw new AppError(
      'Amount has more fractional digits than decimals',
      400,
      'DAO_TOKEN_AMOUNT_PRECISION_INVALID',
    );
  }

  const fractionPart = fractionRaw.padEnd(decimals, '0');
  const base = 10n ** BigInt(decimals);
  const units = BigInt(wholePart) * base + BigInt(fractionPart === '' ? '0' : fractionPart);

  if (units <= 0n || units > maxU64) {
    throw new AppError('Amount is out of range', 400, 'DAO_TOKEN_AMOUNT_RANGE_INVALID');
  }

  return units;
};

const deriveAssociatedTokenAddress = (
  owner: PublicKey,
  mint: PublicKey,
  tokenProgramId = new PublicKey(SOLANA_PROGRAM_IDS.tokenProgram),
  associatedTokenProgramId = new PublicKey(SOLANA_PROGRAM_IDS.associatedTokenProgram),
): PublicKey =>
  PublicKey.findProgramAddressSync(
    [owner.toBuffer(), tokenProgramId.toBuffer(), mint.toBuffer()],
    associatedTokenProgramId,
  )[0];

const createAssociatedTokenAccountInstruction = (input: {
  payer: PublicKey;
  owner: PublicKey;
  mint: PublicKey;
  associatedTokenAddress: PublicKey;
  tokenProgramId?: PublicKey;
  associatedTokenProgramId?: PublicKey;
}): TransactionInstruction => {
  const tokenProgramId = input.tokenProgramId ?? new PublicKey(SOLANA_PROGRAM_IDS.tokenProgram);
  const associatedTokenProgramId =
    input.associatedTokenProgramId ?? new PublicKey(SOLANA_PROGRAM_IDS.associatedTokenProgram);

  return new TransactionInstruction({
    programId: associatedTokenProgramId,
    keys: [
      { pubkey: input.payer, isSigner: true, isWritable: true },
      { pubkey: input.associatedTokenAddress, isSigner: false, isWritable: true },
      { pubkey: input.owner, isSigner: false, isWritable: false },
      { pubkey: input.mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: tokenProgramId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: Buffer.alloc(0),
  });
};

const createMintToInstruction = (input: {
  mint: PublicKey;
  destination: PublicKey;
  mintAuthority: PublicKey;
  amountBaseUnits: bigint;
}): TransactionInstruction => {
  const data = Buffer.alloc(9);
  data.writeUInt8(7, 0); // TokenInstruction::MintTo
  data.writeBigUInt64LE(input.amountBaseUnits, 1);

  return new TransactionInstruction({
    programId: new PublicKey(SOLANA_PROGRAM_IDS.tokenProgram),
    keys: [
      { pubkey: input.mint, isSigner: false, isWritable: true },
      { pubkey: input.destination, isSigner: false, isWritable: true },
      { pubkey: input.mintAuthority, isSigner: true, isWritable: false },
    ],
    data,
  });
};

const createSetMintAuthorityInstruction = (input: {
  mint: PublicKey;
  currentAuthority: PublicKey;
  newAuthority: PublicKey | null;
}): TransactionInstruction => {
  const data = Buffer.alloc(input.newAuthority ? 35 : 3);
  data.writeUInt8(6, 0); // TokenInstruction::SetAuthority
  data.writeUInt8(0, 1); // AuthorityType::MintTokens
  data.writeUInt8(input.newAuthority ? 1 : 0, 2);

  if (input.newAuthority) {
    input.newAuthority.toBuffer().copy(data, 3);
  }

  return new TransactionInstruction({
    programId: new PublicKey(SOLANA_PROGRAM_IDS.tokenProgram),
    keys: [
      { pubkey: input.mint, isSigner: false, isWritable: true },
      { pubkey: input.currentAuthority, isSigner: true, isWritable: false },
    ],
    data,
  });
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

  const existingRealmAccount = await connection.getAccountInfo(realmAddress, env.SOLANA_COMMITMENT as Commitment);

  if (existingRealmAccount) {
    throw new AppError(
      'Realm name already exists on this governance program. Use a different DAO name.',
      409,
      'DAO_REALM_ALREADY_EXISTS',
      {
        fieldErrors: {
          name: ['Realm name already exists on this governance program. Use a different DAO name.'],
        },
      },
    );
  }

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

export const prepareMintDistribution = async (
  daoId: string,
  input: PrepareMintDistributionInput,
  userId: Types.ObjectId,
): Promise<{
  transactionMessage: string;
  transactionBase58: string;
  transactionBase64: string;
  recentBlockhash: string;
  lastValidBlockHeight: number;
  label: string;
  authorityWallet: string;
  payerWallet: string;
  mintAddress: string;
  recipientWallet: string;
  recipientTokenAccount: string;
  amount: string;
  decimals: number;
  network: 'mainnet-beta' | 'devnet';
  rpcUrl: string;
}> => {
  const dao = await assertCanManageDao(daoId, userId);
  const actor = await UserModel.findById(userId).select('walletAddress roles');

  if (!actor?.walletAddress) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const actorWallet = normalizeAddress(actor.walletAddress, 'actor wallet');
  const isAdmin = actor.roles.includes('admin');
  const authorityWallet = normalizeAddress(input.authorityWallet ?? actorWallet, 'authority wallet');
  const payerWallet = normalizeAddress(input.payerWallet ?? actorWallet, 'payer wallet');

  if (!isAdmin && (authorityWallet !== actorWallet || payerWallet !== actorWallet)) {
    throw new AppError(
      'Authority wallet and payer wallet must match your connected wallet',
      403,
      'DAO_AUTHORITY_WALLET_MISMATCH',
    );
  }

  const mintAddress = normalizeAddress(input.mintAddress, 'mint address');
  const recipientWallet = normalizeAddress(input.recipientWallet, 'recipient wallet');
  const mintPk = new PublicKey(mintAddress);
  const recipientPk = new PublicKey(recipientWallet);
  const payerPk = new PublicKey(payerWallet);
  const authorityPk = new PublicKey(authorityWallet);
  const recipientTokenAccount = deriveAssociatedTokenAddress(recipientPk, mintPk);
  const amountBaseUnits = toU64BaseUnits(input.amount, input.decimals);
  const rpcUrl = input.rpcUrl ?? defaultRpcByNetwork[dao.network];
  const connection = new Connection(rpcUrl, { commitment: env.SOLANA_COMMITMENT as Commitment });
  const instructions: TransactionInstruction[] = [];

  if (input.createAssociatedTokenAccount) {
    const destinationAtaInfo = await connection.getAccountInfo(recipientTokenAccount, env.SOLANA_COMMITMENT as Commitment);

    if (!destinationAtaInfo) {
      instructions.push(
        createAssociatedTokenAccountInstruction({
          payer: payerPk,
          owner: recipientPk,
          mint: mintPk,
          associatedTokenAddress: recipientTokenAccount,
        }),
      );
    }
  }

  instructions.push(
    createMintToInstruction({
      mint: mintPk,
      destination: recipientTokenAccount,
      mintAuthority: authorityPk,
      amountBaseUnits,
    }),
  );

  const prepared = await prepareUnsignedTransaction({
    connection,
    instructions,
    feePayer: payerPk,
    label: 'mint-distribution',
  });

  return {
    ...prepared,
    authorityWallet,
    payerWallet,
    mintAddress,
    recipientWallet,
    recipientTokenAccount: recipientTokenAccount.toBase58(),
    amount: input.amount,
    decimals: input.decimals,
    network: dao.network,
    rpcUrl,
  };
};

export const prepareMintAuthorityUpdate = async (
  daoId: string,
  input: PrepareMintAuthorityInput,
  userId: Types.ObjectId,
): Promise<{
  transactionMessage: string;
  transactionBase58: string;
  transactionBase64: string;
  recentBlockhash: string;
  lastValidBlockHeight: number;
  label: string;
  currentAuthorityWallet: string;
  mintAddress: string;
  newAuthorityWallet: string | null;
  network: 'mainnet-beta' | 'devnet';
  rpcUrl: string;
}> => {
  const dao = await assertCanManageDao(daoId, userId);
  const actor = await UserModel.findById(userId).select('walletAddress');

  if (!actor?.walletAddress) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const actorWallet = normalizeAddress(actor.walletAddress, 'actor wallet');
  const currentAuthorityWallet = normalizeAddress(input.currentAuthorityWallet ?? actorWallet, 'current authority wallet');

  if (currentAuthorityWallet !== actorWallet) {
    throw new AppError(
      'Current authority wallet must match your connected wallet',
      403,
      'DAO_AUTHORITY_WALLET_MISMATCH',
    );
  }

  const mintAddress = normalizeAddress(input.mintAddress, 'mint address');
  const mintPk = new PublicKey(mintAddress);
  const currentAuthorityPk = new PublicKey(currentAuthorityWallet);
  const newAuthorityPk = input.newAuthorityWallet ? new PublicKey(normalizeAddress(input.newAuthorityWallet, 'new authority wallet')) : null;
  const rpcUrl = input.rpcUrl ?? defaultRpcByNetwork[dao.network];
  const connection = new Connection(rpcUrl, { commitment: env.SOLANA_COMMITMENT as Commitment });

  const prepared = await prepareUnsignedTransaction({
    connection,
    instructions: [
      createSetMintAuthorityInstruction({
        mint: mintPk,
        currentAuthority: currentAuthorityPk,
        newAuthority: newAuthorityPk,
      }),
    ],
    feePayer: currentAuthorityPk,
    label: 'set-mint-authority',
  });

  return {
    ...prepared,
    currentAuthorityWallet,
    mintAddress,
    newAuthorityWallet: newAuthorityPk ? newAuthorityPk.toBase58() : null,
    network: dao.network,
    rpcUrl,
  };
};

export const prepareVotingDeposit = async (
  daoId: string,
  input: PrepareVotingDepositInput,
  userId: Types.ObjectId,
): Promise<{
  transactionMessage: string;
  transactionBase58: string;
  transactionBase64: string;
  recentBlockhash: string;
  lastValidBlockHeight: number;
  label: string;
  governingTokenMint: string;
  tokenOwnerRecordAddress: string;
  governingTokenOwnerWallet: string;
  tokenSourceAccount: string;
  amount: string;
  decimals: number;
  network: 'mainnet-beta' | 'devnet';
  rpcUrl: string;
}> => {
  const dao = await assertCanManageDao(daoId, userId);
  const actor = await UserModel.findById(userId).select('walletAddress');

  if (!actor?.walletAddress) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const actorWallet = normalizeAddress(actor.walletAddress, 'actor wallet');
  const governingTokenOwnerWallet = normalizeAddress(
    input.governingTokenOwnerWallet ?? actorWallet,
    'governing token owner wallet',
  );
  const payerWallet = normalizeAddress(input.payerWallet ?? actorWallet, 'payer wallet');

  if (governingTokenOwnerWallet !== actorWallet || payerWallet !== actorWallet) {
    throw new AppError(
      'Governing token owner wallet and payer wallet must match your connected wallet',
      403,
      'DAO_AUTHORITY_WALLET_MISMATCH',
    );
  }

  const fallbackMint =
    input.voteScope === 'council'
      ? dao.councilMint
      : dao.communityMint;
  const governingTokenMint = input.governingTokenMint
    ? normalizeAddress(input.governingTokenMint, 'governing token mint')
    : fallbackMint;

  if (!governingTokenMint) {
    throw new AppError(
      input.voteScope === 'council'
        ? 'Council mint is missing for this DAO.'
        : 'Community mint is missing for this DAO.',
      400,
      'DAO_GOVERNING_TOKEN_MINT_MISSING',
    );
  }

  const programId = new PublicKey(dao.governanceProgramId);
  const realmPk = new PublicKey(dao.realmAddress);
  const governingTokenMintPk = new PublicKey(governingTokenMint);
  const governingTokenOwnerPk = new PublicKey(governingTokenOwnerWallet);
  const payerPk = new PublicKey(payerWallet);
  const tokenSourcePk = input.tokenSourceAccount
    ? new PublicKey(normalizeAddress(input.tokenSourceAccount, 'token source account'))
    : deriveAssociatedTokenAddress(governingTokenOwnerPk, governingTokenMintPk);
  const rpcUrl = input.rpcUrl ?? defaultRpcByNetwork[dao.network];
  const connection = new Connection(rpcUrl, { commitment: env.SOLANA_COMMITMENT as Commitment });
  const tokenSourceInfo = await connection.getAccountInfo(tokenSourcePk, env.SOLANA_COMMITMENT as Commitment);

  if (!tokenSourceInfo) {
    throw new AppError(
      'Source token account was not found. Mint/distribute governance tokens first.',
      400,
      'DAO_TOKEN_SOURCE_ACCOUNT_MISSING',
    );
  }

  const amountBaseUnits = toU64BaseUnits(input.amount, input.decimals);
  const instructions: TransactionInstruction[] = [];

  const tokenOwnerRecordAddress = await withDepositGoverningTokens(
    instructions,
    programId,
    input.programVersion,
    realmPk,
    tokenSourcePk,
    governingTokenMintPk,
    governingTokenOwnerPk,
    governingTokenOwnerPk,
    payerPk,
    new BN(amountBaseUnits.toString()),
  );

  const prepared = await prepareUnsignedTransaction({
    connection,
    instructions,
    feePayer: payerPk,
    label: 'deposit-governing-tokens',
  });

  return {
    ...prepared,
    governingTokenMint,
    tokenOwnerRecordAddress: tokenOwnerRecordAddress.toBase58(),
    governingTokenOwnerWallet,
    tokenSourceAccount: tokenSourcePk.toBase58(),
    amount: input.amount,
    decimals: input.decimals,
    network: dao.network,
    rpcUrl,
  };
};

export const prepareVotingWithdraw = async (
  daoId: string,
  input: PrepareVotingWithdrawInput,
  userId: Types.ObjectId,
): Promise<{
  transactionMessage: string;
  transactionBase58: string;
  transactionBase64: string;
  recentBlockhash: string;
  lastValidBlockHeight: number;
  label: string;
  governingTokenMint: string;
  governingTokenOwnerWallet: string;
  destinationTokenAccount: string;
  network: 'mainnet-beta' | 'devnet';
  rpcUrl: string;
}> => {
  const dao = await assertCanManageDao(daoId, userId);
  const actor = await UserModel.findById(userId).select('walletAddress');

  if (!actor?.walletAddress) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const actorWallet = normalizeAddress(actor.walletAddress, 'actor wallet');
  const governingTokenOwnerWallet = normalizeAddress(
    input.governingTokenOwnerWallet ?? actorWallet,
    'governing token owner wallet',
  );
  const payerWallet = normalizeAddress(input.payerWallet ?? actorWallet, 'payer wallet');

  if (governingTokenOwnerWallet !== actorWallet || payerWallet !== actorWallet) {
    throw new AppError(
      'Governing token owner wallet and payer wallet must match your connected wallet',
      403,
      'DAO_AUTHORITY_WALLET_MISMATCH',
    );
  }

  const fallbackMint =
    input.voteScope === 'council'
      ? dao.councilMint
      : dao.communityMint;
  const governingTokenMint = input.governingTokenMint
    ? normalizeAddress(input.governingTokenMint, 'governing token mint')
    : fallbackMint;

  if (!governingTokenMint) {
    throw new AppError(
      input.voteScope === 'council'
        ? 'Council mint is missing for this DAO.'
        : 'Community mint is missing for this DAO.',
      400,
      'DAO_GOVERNING_TOKEN_MINT_MISSING',
    );
  }

  const programId = new PublicKey(dao.governanceProgramId);
  const realmPk = new PublicKey(dao.realmAddress);
  const governingTokenMintPk = new PublicKey(governingTokenMint);
  const governingTokenOwnerPk = new PublicKey(governingTokenOwnerWallet);
  const payerPk = new PublicKey(payerWallet);
  const destinationTokenAccount = input.destinationTokenAccount
    ? new PublicKey(normalizeAddress(input.destinationTokenAccount, 'destination token account'))
    : deriveAssociatedTokenAddress(governingTokenOwnerPk, governingTokenMintPk);
  const rpcUrl = input.rpcUrl ?? defaultRpcByNetwork[dao.network];
  const connection = new Connection(rpcUrl, { commitment: env.SOLANA_COMMITMENT as Commitment });
  const instructions: TransactionInstruction[] = [];

  if (input.createDestinationAta) {
    const destinationInfo = await connection.getAccountInfo(destinationTokenAccount, env.SOLANA_COMMITMENT as Commitment);

    if (!destinationInfo) {
      instructions.push(
        createAssociatedTokenAccountInstruction({
          payer: payerPk,
          owner: governingTokenOwnerPk,
          mint: governingTokenMintPk,
          associatedTokenAddress: destinationTokenAccount,
        }),
      );
    }
  }

  await withWithdrawGoverningTokens(
    instructions,
    programId,
    input.programVersion,
    realmPk,
    destinationTokenAccount,
    governingTokenMintPk,
    governingTokenOwnerPk,
  );

  const prepared = await prepareUnsignedTransaction({
    connection,
    instructions,
    feePayer: payerPk,
    label: 'withdraw-governing-tokens',
  });

  return {
    ...prepared,
    governingTokenMint,
    governingTokenOwnerWallet,
    destinationTokenAccount: destinationTokenAccount.toBase58(),
    network: dao.network,
    rpcUrl,
  };
};

export const prepareVotingDelegate = async (
  daoId: string,
  input: PrepareVotingDelegateInput,
  userId: Types.ObjectId,
): Promise<{
  transactionMessage: string;
  transactionBase58: string;
  transactionBase64: string;
  recentBlockhash: string;
  lastValidBlockHeight: number;
  label: string;
  governingTokenMint: string;
  governingTokenOwnerWallet: string;
  newDelegateWallet: string | null;
  network: 'mainnet-beta' | 'devnet';
  rpcUrl: string;
}> => {
  const dao = await assertCanManageDao(daoId, userId);
  const actor = await UserModel.findById(userId).select('walletAddress');

  if (!actor?.walletAddress) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const actorWallet = normalizeAddress(actor.walletAddress, 'actor wallet');
  const governingTokenOwnerWallet = normalizeAddress(
    input.governingTokenOwnerWallet ?? actorWallet,
    'governing token owner wallet',
  );

  if (governingTokenOwnerWallet !== actorWallet) {
    throw new AppError(
      'Governing token owner wallet must match your connected wallet',
      403,
      'DAO_AUTHORITY_WALLET_MISMATCH',
    );
  }

  const fallbackMint =
    input.voteScope === 'council'
      ? dao.councilMint
      : dao.communityMint;
  const governingTokenMint = input.governingTokenMint
    ? normalizeAddress(input.governingTokenMint, 'governing token mint')
    : fallbackMint;

  if (!governingTokenMint) {
    throw new AppError(
      input.voteScope === 'council'
        ? 'Council mint is missing for this DAO.'
        : 'Community mint is missing for this DAO.',
      400,
      'DAO_GOVERNING_TOKEN_MINT_MISSING',
    );
  }

  const programId = new PublicKey(dao.governanceProgramId);
  const realmPk = new PublicKey(dao.realmAddress);
  const governingTokenMintPk = new PublicKey(governingTokenMint);
  const governingTokenOwnerPk = new PublicKey(governingTokenOwnerWallet);
  const newDelegateWallet = input.newDelegateWallet
    ? normalizeAddress(input.newDelegateWallet, 'new delegate wallet')
    : null;
  const newDelegatePk = newDelegateWallet ? new PublicKey(newDelegateWallet) : undefined;
  const rpcUrl = input.rpcUrl ?? defaultRpcByNetwork[dao.network];
  const connection = new Connection(rpcUrl, { commitment: env.SOLANA_COMMITMENT as Commitment });
  const instructions: TransactionInstruction[] = [];

  await withSetGovernanceDelegate(
    instructions,
    programId,
    input.programVersion,
    realmPk,
    governingTokenMintPk,
    governingTokenOwnerPk,
    governingTokenOwnerPk,
    newDelegatePk,
  );

  const prepared = await prepareUnsignedTransaction({
    connection,
    instructions,
    feePayer: governingTokenOwnerPk,
    label: 'set-governance-delegate',
  });

  return {
    ...prepared,
    governingTokenMint,
    governingTokenOwnerWallet,
    newDelegateWallet,
    network: dao.network,
    rpcUrl,
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
