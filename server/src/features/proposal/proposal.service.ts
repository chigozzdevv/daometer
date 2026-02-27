import { Types } from 'mongoose';
import { Connection, PublicKey, type Commitment } from '@solana/web3.js';
import { getProposal, getProposalTransactionAddress, ProposalState as OnchainProposalState } from '@realms-today/spl-governance';
import { env } from '@/config/env.config';
import { UserModel } from '@/features/auth/auth.model';
import { DaoModel } from '@/features/dao/dao.model';
import { ProposalModel, type ProposalDocument } from '@/features/proposal/proposal.model';
import { AppError } from '@/shared/errors/app-error';
import {
  createOnchainProposalFromStoredInstructions,
  prepareOnchainProposalFromStoredInstructions,
} from '@/shared/solana/governance-proposal-creator';
import { prepareGovernanceProposalExecutionTransactions } from '@/shared/solana/governance-executor';
import { assertInstructionsAreOnchainCreatable } from '@/shared/solana/onchain-instruction-support.util';
import { assertCanManageDao } from '@/shared/utils/authorization.util';
import { generateBase58String } from '@/shared/utils/base58.util';

export type ProposalInstructionInput = {
  index: number;
  kind: 'transfer' | 'config' | 'program-upgrade' | 'stream' | 'custom';
  label: string;
  programId: string;
  accounts: string[];
  accountMetas?: Array<{
    pubkey: string;
    isSigner: boolean;
    isWritable: boolean;
  }>;
  dataBase64?: string;
  riskScore: number;
};

export type CreateProposalInput = {
  daoId: string;
  sourceFlowId?: string;
  proposalAddress?: string;
  title: string;
  description?: string;
  voteScope: 'community' | 'council';
  state: 'draft' | 'voting';
  holdUpSeconds: number;
  votingEndsAt: Date;
  instructions: ProposalInstructionInput[];
  automation?: {
    autoExecute?: boolean;
    executeAfterHoldUp?: boolean;
    maxRiskScore?: number;
  };
  onchainExecution?: {
    enabled?: boolean;
    governanceProgramId?: string;
    programVersion?: number;
    governanceAddress?: string;
    proposalAddress?: string;
    transactionAddresses?: string[];
    rpcUrl?: string;
    requireSimulation?: boolean;
  };
};

type ProposalState = 'draft' | 'voting' | 'succeeded' | 'defeated' | 'cancelled' | 'executed' | 'execution-error';

const riskLevelFromScore = (score: number): 'safe' | 'warning' | 'critical' => {
  if (score <= 30) {
    return 'safe';
  }

  if (score <= 70) {
    return 'warning';
  }

  return 'critical';
};

const allowedTransitions: Record<ProposalState, ProposalState[]> = {
  draft: ['voting', 'cancelled'],
  voting: ['succeeded', 'defeated', 'cancelled'],
  succeeded: ['executed', 'execution-error'],
  defeated: [],
  cancelled: [],
  executed: [],
  'execution-error': ['executed'],
};

export const createProposal = async (input: CreateProposalInput, userId: Types.ObjectId): Promise<ProposalDocument> => {
  const dao = await assertCanManageDao(input.daoId, userId);
  const internalProposalAddress = input.proposalAddress ?? generateBase58String(44);

  const existingProposal = await ProposalModel.findOne({ proposalAddress: internalProposalAddress });

  if (existingProposal) {
    throw new AppError('Proposal address already exists', 409, 'PROPOSAL_EXISTS');
  }

  const riskScore = input.instructions.reduce((maxScore, instruction) => Math.max(maxScore, instruction.riskScore), 0);
  const riskLevel = riskLevelFromScore(riskScore);

  const instructions = input.instructions.map((instruction) => ({
    ...instruction,
    riskLevel: riskLevelFromScore(instruction.riskScore),
  }));

  const proposal = await ProposalModel.create({
    daoId: new Types.ObjectId(input.daoId),
    sourceFlowId: input.sourceFlowId ? new Types.ObjectId(input.sourceFlowId) : null,
    proposalAddress: internalProposalAddress,
    title: input.title,
    description: input.description ?? '',
    voteScope: input.voteScope,
    state: input.state,
    holdUpSeconds: input.holdUpSeconds,
    votingEndsAt: input.votingEndsAt,
    riskScore,
    riskLevel,
    instructions,
    createdBy: userId,
    automation: {
      autoExecute: input.automation?.autoExecute ?? dao.automationConfig.autoExecuteEnabled,
      executeAfterHoldUp: input.automation?.executeAfterHoldUp ?? true,
      maxRiskScore: input.automation?.maxRiskScore ?? dao.automationConfig.maxRiskScore ?? env.AUTO_EXECUTION_DEFAULT_RISK_SCORE,
    },
    onchainExecution: {
      enabled: input.onchainExecution?.enabled ?? false,
      governanceProgramId: input.onchainExecution?.governanceProgramId ?? dao.governanceProgramId,
      programVersion: input.onchainExecution?.programVersion ?? 3,
      governanceAddress: input.onchainExecution?.governanceAddress ?? null,
      proposalAddress: input.onchainExecution?.proposalAddress ?? null,
      transactionAddresses: input.onchainExecution?.transactionAddresses ?? [],
      rpcUrl: input.onchainExecution?.rpcUrl ?? null,
      requireSimulation: input.onchainExecution?.requireSimulation ?? dao.automationConfig.requireSimulation,
    },
  });

  return proposal;
};

export const listDaoProposals = async (
  daoId: string,
  options: { page: number; limit: number; state?: ProposalState },
): Promise<{
  items: ProposalDocument[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}> => {
  const filter: {
    daoId: Types.ObjectId;
    state?: ProposalState;
  } = {
    daoId: new Types.ObjectId(daoId),
  };

  if (options.state) {
    filter.state = options.state;
  }

  const skip = (options.page - 1) * options.limit;

  const [items, total] = await Promise.all([
    ProposalModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(options.limit),
    ProposalModel.countDocuments(filter),
  ]);

  return {
    items,
    pagination: {
      page: options.page,
      limit: options.limit,
      total,
      totalPages: Math.ceil(total / options.limit),
    },
  };
};

export const getProposalById = async (proposalId: string): Promise<ProposalDocument> => {
  const proposal = await ProposalModel.findById(proposalId);

  if (!proposal) {
    throw new AppError('Proposal not found', 404, 'PROPOSAL_NOT_FOUND');
  }

  return proposal;
};

export const transitionProposalState = async (
  proposalId: string,
  state: ProposalState,
  executionError?: string,
  actorUserId?: Types.ObjectId,
): Promise<ProposalDocument> => {
  const proposal = await ProposalModel.findById(proposalId);

  if (!proposal) {
    throw new AppError('Proposal not found', 404, 'PROPOSAL_NOT_FOUND');
  }

  if (actorUserId) {
    await assertCanManageDao(proposal.daoId, actorUserId);
  }

  const currentState = proposal.state as ProposalState;

  if (currentState === state) {
    return proposal;
  }

  if (!allowedTransitions[currentState].includes(state)) {
    throw new AppError(
      `Invalid state transition from ${currentState} to ${state}`,
      400,
      'INVALID_PROPOSAL_TRANSITION',
    );
  }

  proposal.state = state;

  if (state === 'succeeded') {
    proposal.succeededAt = new Date();
    proposal.executionError = null;
  }

  if (state === 'executed') {
    proposal.executedAt = new Date();
    proposal.executionError = null;
  }

  if (state === 'execution-error') {
    proposal.executionError = executionError ?? 'Execution failed';
  }

  await proposal.save();
  return proposal;
};

export const updateProposalOnchainExecution = async (
  proposalId: string,
  input: {
    enabled: boolean;
    governanceProgramId?: string;
    programVersion: number;
    governanceAddress?: string;
    proposalAddress?: string;
    transactionAddresses: string[];
    rpcUrl?: string;
    requireSimulation: boolean;
  },
  actorUserId?: Types.ObjectId,
): Promise<ProposalDocument> => {
  const proposal = await ProposalModel.findById(proposalId);

  if (!proposal) {
    throw new AppError('Proposal not found', 404, 'PROPOSAL_NOT_FOUND');
  }

  if (actorUserId) {
    await assertCanManageDao(proposal.daoId, actorUserId);
  }

  proposal.onchainExecution = {
    enabled: input.enabled,
    governanceProgramId: input.governanceProgramId ?? proposal.onchainExecution.governanceProgramId,
    programVersion: input.programVersion,
    governanceAddress: input.governanceAddress ?? proposal.onchainExecution.governanceAddress,
    proposalAddress: input.proposalAddress ?? proposal.onchainExecution.proposalAddress,
    transactionAddresses: input.transactionAddresses,
    rpcUrl: input.rpcUrl ?? proposal.onchainExecution.rpcUrl,
    requireSimulation: input.requireSimulation,
  };

  await proposal.save();
  return proposal;
};

export const syncProposalOnchainExecution = async (
  proposalId: string,
  input: {
    governanceProgramId?: string;
    programVersion: number;
    governanceAddress?: string;
    proposalAddress?: string;
    optionIndexes?: number[];
    rpcUrl?: string;
    requireSimulation: boolean;
  },
  actorUserId?: Types.ObjectId,
): Promise<ProposalDocument> => {
  const proposal = await ProposalModel.findById(proposalId);

  if (!proposal) {
    throw new AppError('Proposal not found', 404, 'PROPOSAL_NOT_FOUND');
  }

  if (actorUserId) {
    await assertCanManageDao(proposal.daoId, actorUserId);
  }

  const governanceProgramId = input.governanceProgramId ?? proposal.onchainExecution.governanceProgramId;
  const governanceAddress = input.governanceAddress ?? proposal.onchainExecution.governanceAddress;
  const proposalAddress = input.proposalAddress ?? proposal.onchainExecution.proposalAddress;
  const rpcUrl = input.rpcUrl ?? proposal.onchainExecution.rpcUrl ?? env.SOLANA_RPC_URL;

  if (!governanceProgramId || !governanceAddress || !proposalAddress) {
    throw new AppError(
      'governanceProgramId, governanceAddress and proposalAddress are required for onchain sync',
      400,
      'ONCHAIN_SYNC_MISSING_CONFIG',
    );
  }

  const connection = new Connection(rpcUrl, { commitment: env.SOLANA_COMMITMENT as Commitment });
  const governanceProgramPublicKey = new PublicKey(governanceProgramId);
  const proposalPublicKey = new PublicKey(proposalAddress);

  const onchainProposal = await getProposal(connection, proposalPublicKey);
  const candidateOptionIndexes = input.optionIndexes ?? onchainProposal.account.options.map((_option, index) => index);
  const transactionAddressSet = new Set<string>();

  for (const optionIndex of candidateOptionIndexes) {
    const proposalOption = onchainProposal.account.options[optionIndex];

    if (!proposalOption) {
      continue;
    }

    const maxTransactionIndex = Math.max(proposalOption.instructionsCount, proposalOption.instructionsNextIndex);

    for (let transactionIndex = 0; transactionIndex < maxTransactionIndex; transactionIndex += 1) {
      const transactionAddress = await getProposalTransactionAddress(
        governanceProgramPublicKey,
        input.programVersion,
        proposalPublicKey,
        optionIndex,
        transactionIndex,
      );

      const accountInfo = await connection.getAccountInfo(transactionAddress, env.SOLANA_COMMITMENT as Commitment);

      if (accountInfo) {
        transactionAddressSet.add(transactionAddress.toBase58());
      }
    }
  }

  proposal.onchainExecution = {
    enabled: transactionAddressSet.size > 0,
    governanceProgramId,
    programVersion: input.programVersion,
    governanceAddress,
    proposalAddress,
    transactionAddresses: [...transactionAddressSet],
    rpcUrl,
    requireSimulation: input.requireSimulation,
  };

  await proposal.save();
  return proposal;
};

export const createProposalOnchain = async (
  proposalId: string,
  input: {
    governanceProgramId?: string;
    programVersion: number;
    realmAddress: string;
    governanceAddress: string;
    governingTokenMint: string;
    descriptionLink?: string;
    optionIndex: number;
    useDenyOption: boolean;
    rpcUrl?: string;
    signOff: boolean;
    requireSimulation: boolean;
  },
  actorUserId?: Types.ObjectId,
): Promise<{
  proposal: ProposalDocument;
  signatures: string[];
}> => {
  const proposal = await ProposalModel.findById(proposalId);

  if (!proposal) {
    throw new AppError('Proposal not found', 404, 'PROPOSAL_NOT_FOUND');
  }

  if (actorUserId) {
    await assertCanManageDao(proposal.daoId, actorUserId);
  }

  assertInstructionsAreOnchainCreatable(proposal.instructions);

  const dao = await DaoModel.findById(proposal.daoId).select('governanceProgramId');

  if (!dao) {
    throw new AppError('DAO not found', 404, 'DAO_NOT_FOUND');
  }

  const result = await createOnchainProposalFromStoredInstructions({
    governanceProgramId: input.governanceProgramId ?? dao.governanceProgramId,
    programVersion: input.programVersion,
    realmAddress: input.realmAddress,
    governanceAddress: input.governanceAddress,
    governingTokenMint: input.governingTokenMint,
    proposalName: proposal.title,
    descriptionLink: input.descriptionLink ?? 'https://docs.realms.today',
    holdUpSeconds: proposal.holdUpSeconds,
    instructions: proposal.instructions,
    optionIndex: input.optionIndex,
    useDenyOption: input.useDenyOption,
    rpcUrl: input.rpcUrl,
    signOff: input.signOff,
  });

  proposal.onchainExecution = {
    enabled: true,
    governanceProgramId: input.governanceProgramId ?? dao.governanceProgramId,
    programVersion: input.programVersion,
    governanceAddress: input.governanceAddress,
    proposalAddress: result.proposalAddress,
    transactionAddresses: result.transactionAddresses,
    rpcUrl: input.rpcUrl ?? env.SOLANA_RPC_URL,
    requireSimulation: input.requireSimulation,
  };

  if (input.signOff && proposal.state === 'draft') {
    proposal.state = 'voting';
  }

  await proposal.save();

  return {
    proposal,
    signatures: result.signatures,
  };
};

const mapOnchainProposalState = (
  onchainState: OnchainProposalState,
): 'draft' | 'voting' | 'succeeded' | 'defeated' | 'cancelled' | 'executed' | 'execution-error' => {
  if (onchainState === OnchainProposalState.Draft || onchainState === OnchainProposalState.SigningOff) {
    return 'draft';
  }

  if (onchainState === OnchainProposalState.Voting) {
    return 'voting';
  }

  if (onchainState === OnchainProposalState.Succeeded || onchainState === OnchainProposalState.Executing) {
    return 'succeeded';
  }

  if (onchainState === OnchainProposalState.ExecutingWithErrors) {
    return 'execution-error';
  }

  if (onchainState === OnchainProposalState.Completed) {
    return 'executed';
  }

  if (onchainState === OnchainProposalState.Cancelled) {
    return 'cancelled';
  }

  return 'defeated';
};

export const syncOnchainProposalStates = async (): Promise<{
  checked: number;
  updated: number;
  failed: number;
}> => {
  const proposals = await ProposalModel.find({
    'onchainExecution.enabled': true,
    'onchainExecution.proposalAddress': { $ne: null },
    state: { $in: ['draft', 'voting', 'succeeded', 'execution-error'] },
  }).limit(100);

  if (proposals.length === 0) {
    return { checked: 0, updated: 0, failed: 0 };
  }

  const connectionMap = new Map<string, Connection>();
  let updated = 0;
  let failed = 0;

  for (const proposal of proposals) {
    try {
      const rpcUrl = proposal.onchainExecution.rpcUrl ?? env.SOLANA_RPC_URL;
      const cacheKey = `${rpcUrl}::${env.SOLANA_COMMITMENT}`;

      let connection = connectionMap.get(cacheKey);

      if (!connection) {
        connection = new Connection(rpcUrl, { commitment: env.SOLANA_COMMITMENT as Commitment });
        connectionMap.set(cacheKey, connection);
      }

      const onchainProposalAddress = new PublicKey(proposal.onchainExecution.proposalAddress as string);
      const onchainProposal = await getProposal(connection, onchainProposalAddress);
      const mappedState = mapOnchainProposalState(onchainProposal.account.state);

      let hasChanges = false;

      if (proposal.state !== mappedState) {
        proposal.state = mappedState;
        hasChanges = true;
      }

      if (mappedState === 'succeeded' && !proposal.succeededAt) {
        proposal.succeededAt = new Date();
        hasChanges = true;
      }

      if (mappedState === 'executed' && !proposal.executedAt) {
        proposal.executedAt = new Date();
        hasChanges = true;
      }

      if (hasChanges) {
        await proposal.save();
        updated += 1;
      }
    } catch {
      failed += 1;
    }
  }

  return {
    checked: proposals.length,
    updated,
    failed,
  };
};

export const markProposalExecuted = async (proposalId: Types.ObjectId, executionReference: string): Promise<ProposalDocument> => {
  const proposal = await ProposalModel.findById(proposalId);

  if (!proposal) {
    throw new AppError('Proposal not found', 404, 'PROPOSAL_NOT_FOUND');
  }

  if (proposal.state !== 'succeeded' && proposal.state !== 'execution-error') {
    throw new AppError('Proposal is not executable', 400, 'PROPOSAL_NOT_EXECUTABLE');
  }

  proposal.state = 'executed';
  proposal.executedAt = new Date();
  proposal.executionReference = executionReference;
  proposal.executionError = null;

  await proposal.save();

  return proposal;
};

export const prepareProposalOnchainCreate = async (
  proposalId: string,
  input: {
    governanceProgramId?: string;
    programVersion: number;
    realmAddress: string;
    governanceAddress: string;
    governingTokenMint: string;
    descriptionLink?: string;
    optionIndex: number;
    useDenyOption: boolean;
    rpcUrl?: string;
    signOff: boolean;
  },
  actorUserId: Types.ObjectId,
): Promise<{
  proposal: ProposalDocument;
  proposalAddress: string;
  transactionAddresses: string[];
  preparedTransactions: Array<{
    label: string;
    transactionMessage: string;
    transactionBase58: string;
    transactionBase64: string;
    recentBlockhash: string;
    lastValidBlockHeight: number;
  }>;
}> => {
  const proposal = await ProposalModel.findById(proposalId);

  if (!proposal) {
    throw new AppError('Proposal not found', 404, 'PROPOSAL_NOT_FOUND');
  }

  const dao = await assertCanManageDao(proposal.daoId, actorUserId);
  const actor = await UserModel.findById(actorUserId).select('walletAddress');

  if (!actor?.walletAddress) {
    throw new AppError('Connected wallet not found', 401, 'UNAUTHORIZED');
  }

  assertInstructionsAreOnchainCreatable(proposal.instructions);

  const result = await prepareOnchainProposalFromStoredInstructions({
    governanceProgramId: input.governanceProgramId ?? dao.governanceProgramId,
    programVersion: input.programVersion,
    realmAddress: input.realmAddress,
    governanceAddress: input.governanceAddress,
    governingTokenMint: input.governingTokenMint,
    proposalName: proposal.title,
    descriptionLink: input.descriptionLink ?? 'https://docs.realms.today',
    holdUpSeconds: proposal.holdUpSeconds,
    instructions: proposal.instructions,
    optionIndex: input.optionIndex,
    useDenyOption: input.useDenyOption,
    rpcUrl: input.rpcUrl,
    signOff: input.signOff,
    authorityWallet: actor.walletAddress,
    payerWallet: actor.walletAddress,
  });

  return {
    proposal,
    proposalAddress: result.proposalAddress,
    transactionAddresses: result.transactionAddresses,
    preparedTransactions: result.preparedTransactions,
  };
};

export const prepareProposalOnchainExecution = async (
  proposalId: string,
  input: {
    rpcUrl?: string;
  },
  actorUserId: Types.ObjectId,
): Promise<{
  proposal: ProposalDocument;
  skippedTransactionAddresses: string[];
  preparedTransactions: Array<{
    label: string;
    transactionMessage: string;
    transactionBase58: string;
    transactionBase64: string;
    recentBlockhash: string;
    lastValidBlockHeight: number;
  }>;
}> => {
  const proposal = await ProposalModel.findById(proposalId);

  if (!proposal) {
    throw new AppError('Proposal not found', 404, 'PROPOSAL_NOT_FOUND');
  }

  await assertCanManageDao(proposal.daoId, actorUserId);

  if (!proposal.onchainExecution.enabled) {
    throw new AppError('On-chain execution is not enabled for this proposal', 400, 'ONCHAIN_EXECUTION_NOT_ENABLED');
  }

  if (
    !proposal.onchainExecution.governanceProgramId ||
    !proposal.onchainExecution.governanceAddress ||
    !proposal.onchainExecution.proposalAddress
  ) {
    throw new AppError('On-chain execution metadata is incomplete', 400, 'ONCHAIN_EXECUTION_METADATA_MISSING');
  }

  const actor = await UserModel.findById(actorUserId).select('walletAddress');

  if (!actor?.walletAddress) {
    throw new AppError('Connected wallet not found', 401, 'UNAUTHORIZED');
  }

  const prepared = await prepareGovernanceProposalExecutionTransactions({
    governanceProgramId: proposal.onchainExecution.governanceProgramId,
    programVersion: proposal.onchainExecution.programVersion,
    governanceAddress: proposal.onchainExecution.governanceAddress,
    proposalAddress: proposal.onchainExecution.proposalAddress,
    transactionAddresses: proposal.onchainExecution.transactionAddresses,
    feePayerWallet: actor.walletAddress,
    rpcUrl: input.rpcUrl ?? proposal.onchainExecution.rpcUrl ?? undefined,
  });

  return {
    proposal,
    skippedTransactionAddresses: prepared.skippedTransactionAddresses,
    preparedTransactions: prepared.preparedTransactions,
  };
};

export const markProposalExecutionFailed = async (proposalId: Types.ObjectId, reason: string): Promise<void> => {
  const proposal = await ProposalModel.findById(proposalId);

  if (!proposal) {
    return;
  }

  proposal.state = 'execution-error';
  proposal.executionError = reason;
  await proposal.save();
};

export const decideProposalManualApproval = async (
  proposalId: string,
  input: { approved: boolean; note?: string },
  actorUserId: Types.ObjectId,
): Promise<ProposalDocument> => {
  const proposal = await ProposalModel.findById(proposalId);

  if (!proposal) {
    throw new AppError('Proposal not found', 404, 'PROPOSAL_NOT_FOUND');
  }

  await assertCanManageDao(proposal.daoId, actorUserId);

  if (!proposal.manualApproval.required) {
    throw new AppError('Manual approval is not required for this proposal', 400, 'MANUAL_APPROVAL_NOT_REQUIRED');
  }

  proposal.manualApproval = {
    required: true,
    approved: input.approved,
    approvedBy: actorUserId,
    approvedAt: new Date(),
    note: input.note ?? null,
  };

  if (input.approved) {
    proposal.executionError = null;
    if (proposal.state === 'execution-error' && !proposal.executedAt) {
      proposal.state = 'succeeded';

      if (!proposal.succeededAt) {
        proposal.succeededAt = new Date();
      }
    }
  } else if (proposal.state === 'succeeded') {
    proposal.state = 'execution-error';
    proposal.executionError = input.note ?? 'Manual approval rejected';
  }

  await proposal.save();
  return proposal;
};

export const findAutoExecutionCandidates = async (): Promise<ProposalDocument[]> =>
  ProposalModel.find({
    state: 'succeeded',
    executedAt: null,
    'automation.autoExecute': true,
  }).sort({ succeededAt: 1 });
