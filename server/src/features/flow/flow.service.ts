import { Types } from 'mongoose';
import { compileFlowBlocks } from '@/features/flow/flow.compiler';
import { FlowModel, type FlowDocument } from '@/features/flow/flow.model';
import type { FlowBlock, FlowCompileContext, FlowGraph, FlowProposalDefaults } from '@/features/flow/flow.types';
import { DaoModel } from '@/features/dao/dao.model';
import { listDaoGovernances } from '@/features/dao/dao.service';
import { createProposal, createProposalOnchain, type CreateProposalInput } from '@/features/proposal/proposal.service';
import { AppError } from '@/shared/errors/app-error';
import { assertCanManageDao } from '@/shared/utils/authorization.util';
import { generateBase58String } from '@/shared/utils/base58.util';
import { toSlug } from '@/shared/utils/slug.util';

type CreateFlowInput = {
  daoId: string;
  name: string;
  description?: string;
  tags?: string[];
  blocks: FlowBlock[];
  graph?: FlowGraph;
  proposalDefaults?: Partial<FlowProposalDefaults>;
};

type UpdateFlowInput = {
  name?: string;
  description?: string;
  tags?: string[];
  blocks?: FlowBlock[];
  graph?: FlowGraph;
  proposalDefaults?: Partial<FlowProposalDefaults>;
  status?: 'draft' | 'published' | 'archived';
};

type PublishFlowInput = {
  proposalAddress?: string;
  title?: string;
  description?: string;
  voteScope?: 'community' | 'council';
  state?: 'draft' | 'voting';
  holdUpSeconds?: number;
  votingDurationHours?: number;
  automation?: {
    autoExecute?: boolean;
    executeAfterHoldUp?: boolean;
    maxRiskScore?: number;
  };
  context?: FlowCompileContext;
  onchainExecution?: {
    enabled: boolean;
    governanceProgramId?: string;
    programVersion: number;
    governanceAddress: string;
    proposalAddress?: string;
    transactionAddresses: string[];
    rpcUrl?: string;
    requireSimulation: boolean;
  };
  onchainCreate?: {
    enabled: boolean;
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
  };
};

const resolveOnchainCreateConfig = async (
  flow: FlowDocument,
  onchainCreate: NonNullable<PublishFlowInput['onchainCreate']>,
): Promise<NonNullable<PublishFlowInput['onchainCreate']>> => {
  const dao = await DaoModel.findById(flow.daoId).select(
    'realmAddress governanceProgramId communityMint defaultGovernanceAddress',
  );

  if (!dao) {
    throw new AppError('DAO not found', 404, 'DAO_NOT_FOUND');
  }

  const resolvedRealmAddress = onchainCreate.realmAddress?.trim() || dao.realmAddress;
  const resolvedGovernanceProgramId = onchainCreate.governanceProgramId?.trim() || dao.governanceProgramId;
  const resolvedGoverningTokenMint = onchainCreate.governingTokenMint?.trim() || dao.communityMint;
  let resolvedGovernanceAddress =
    onchainCreate.governanceAddress?.trim() || dao.defaultGovernanceAddress || null;

  if (!resolvedGovernanceAddress) {
    const governanceResult = await listDaoGovernances(flow.daoId.toString());

    if (governanceResult.items.length === 1) {
      resolvedGovernanceAddress = governanceResult.items[0].address;
    } else if (governanceResult.items.length > 1) {
      throw new AppError(
        'Multiple governance accounts found. Set a default governance account on the DAO page.',
        400,
        'FLOW_GOVERNANCE_DEFAULT_REQUIRED',
      );
    } else {
      throw new AppError(
        'No governance account found for this DAO. Create one in Realms, then set it as default in DAO settings.',
        400,
        'FLOW_GOVERNANCE_NOT_FOUND',
      );
    }
  }

  if (!resolvedGoverningTokenMint) {
    throw new AppError(
      'Governing token mint is missing. Set community mint on DAO setup or pass governingTokenMint explicitly.',
      400,
      'FLOW_GOVERNING_TOKEN_MINT_MISSING',
    );
  }

  return {
    ...onchainCreate,
    governanceProgramId: resolvedGovernanceProgramId,
    realmAddress: resolvedRealmAddress,
    governanceAddress: resolvedGovernanceAddress,
    governingTokenMint: resolvedGoverningTokenMint,
  };
};

const defaultProposalDefaults: FlowProposalDefaults = {
  titlePrefix: 'Proposal',
  voteScope: 'community',
  state: 'voting',
  holdUpSeconds: 0,
  votingDurationHours: 72,
  autoExecute: true,
  executeAfterHoldUp: true,
  maxRiskScore: 70,
};

const assertFlowOwner = (flow: FlowDocument, userId: Types.ObjectId): void => {
  if (!flow.createdBy.equals(userId)) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }
};

const buildCompilationSnapshot = (result: ReturnType<typeof compileFlowBlocks>) => ({
  compiledAt: new Date(),
  riskScore: result.riskScore,
  riskLevel: result.riskLevel,
  warnings: result.warnings,
  instructionCount: result.instructions.length,
});

export const createFlow = async (input: CreateFlowInput, userId: Types.ObjectId): Promise<FlowDocument> => {
  await assertCanManageDao(input.daoId, userId);

  const slug = toSlug(input.name);
  const existingFlow = await FlowModel.findOne({ daoId: input.daoId, slug });

  if (existingFlow) {
    throw new AppError('Flow with this name already exists in DAO', 409, 'FLOW_EXISTS');
  }

  const proposalDefaults: FlowProposalDefaults = {
    ...defaultProposalDefaults,
    ...input.proposalDefaults,
  };

  const compilation = compileFlowBlocks(input.blocks);

  return FlowModel.create({
    daoId: new Types.ObjectId(input.daoId),
    name: input.name,
    slug,
    description: input.description ?? '',
    tags: input.tags ?? [],
    blocks: input.blocks,
    graph: input.graph ?? null,
    proposalDefaults,
    latestCompilation: buildCompilationSnapshot(compilation),
    createdBy: userId,
    updatedBy: userId,
  });
};

export const listFlows = async (options: {
  page: number;
  limit: number;
  daoId?: string;
  status?: 'draft' | 'published' | 'archived';
  search?: string;
}): Promise<{
  items: FlowDocument[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}> => {
  const filter: {
    daoId?: Types.ObjectId;
    status?: 'draft' | 'published' | 'archived';
    $or?: Array<Record<string, { $regex: string; $options: string }>>;
  } = {};

  if (options.daoId) {
    filter.daoId = new Types.ObjectId(options.daoId);
  }

  if (options.status) {
    filter.status = options.status;
  }

  if (options.search) {
    filter.$or = [
      { name: { $regex: options.search, $options: 'i' } },
      { slug: { $regex: options.search, $options: 'i' } },
      { description: { $regex: options.search, $options: 'i' } },
    ];
  }

  const skip = (options.page - 1) * options.limit;

  const [items, total] = await Promise.all([
    FlowModel.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(options.limit),
    FlowModel.countDocuments(filter),
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

export const getFlowById = async (flowId: string): Promise<FlowDocument> => {
  const flow = await FlowModel.findById(flowId);

  if (!flow) {
    throw new AppError('Flow not found', 404, 'FLOW_NOT_FOUND');
  }

  return flow;
};

export const updateFlow = async (flowId: string, input: UpdateFlowInput, userId: Types.ObjectId): Promise<FlowDocument> => {
  const flow = await getFlowById(flowId);
  assertFlowOwner(flow, userId);

  if (input.name) {
    const nextSlug = toSlug(input.name);
    const conflictingFlow = await FlowModel.findOne({
      _id: { $ne: flow._id },
      daoId: flow.daoId,
      slug: nextSlug,
    });

    if (conflictingFlow) {
      throw new AppError('Flow with this name already exists in DAO', 409, 'FLOW_EXISTS');
    }

    flow.name = input.name;
    flow.slug = nextSlug;
  }

  if (input.description !== undefined) {
    flow.description = input.description;
  }

  if (input.tags) {
    flow.tags = input.tags;
  }

  if (input.status) {
    flow.status = input.status;
  }

  if (input.blocks) {
    flow.blocks = input.blocks;
    flow.latestCompilation = null;
  }

  if (input.graph) {
    flow.graph = input.graph;
  }

  if (input.proposalDefaults) {
    flow.proposalDefaults = {
      ...flow.proposalDefaults,
      ...input.proposalDefaults,
    };
  }

  flow.version += 1;
  flow.updatedBy = userId;

  await flow.save();
  return flow;
};

export const compileFlow = async (
  flowId: string,
  userId: Types.ObjectId,
  context: FlowCompileContext = {},
): Promise<ReturnType<typeof compileFlowBlocks>> => {
  const flow = await getFlowById(flowId);
  assertFlowOwner(flow, userId);

  const compilation = compileFlowBlocks(flow.blocks as FlowBlock[], context);

  flow.latestCompilation = buildCompilationSnapshot(compilation);
  flow.updatedBy = userId;
  await flow.save();

  return compilation;
};

export const compileInlineFlow = (blocks: FlowBlock[], context: FlowCompileContext = {}) => compileFlowBlocks(blocks, context);

export const publishFlow = async (
  flowId: string,
  userId: Types.ObjectId,
  input: PublishFlowInput,
): Promise<{
  flow: FlowDocument;
  proposalId: string;
  compilation: ReturnType<typeof compileFlowBlocks>;
  onchainCreation?: {
    signatures: string[];
    onchainProposalAddress: string | null;
    onchainTransactionAddresses: string[];
  };
  onchainCreationError?: string;
}> => {
  const flow = await getFlowById(flowId);
  assertFlowOwner(flow, userId);

  const compilation = compileFlowBlocks(flow.blocks as FlowBlock[], input.context);

  const proposalDefaults = {
    ...defaultProposalDefaults,
    ...flow.proposalDefaults,
  };
  const proposalAddress = input.proposalAddress ?? generateBase58String(44);
  const resolvedOnchainCreate = input.onchainCreate?.enabled
    ? await resolveOnchainCreateConfig(flow, input.onchainCreate)
    : undefined;

  if (
    resolvedOnchainCreate?.enabled &&
    (!resolvedOnchainCreate.realmAddress ||
      !resolvedOnchainCreate.governanceAddress ||
      !resolvedOnchainCreate.governingTokenMint)
  ) {
    throw new AppError(
      'realmAddress, governanceAddress and governingTokenMint are required for onchainCreate',
      400,
      'FLOW_ONCHAIN_CREATE_CONFIG_INVALID',
    );
  }

  const proposalInput: CreateProposalInput = {
    daoId: flow.daoId.toString(),
    proposalAddress,
    title: input.title ?? `${proposalDefaults.titlePrefix}: ${flow.name} v${flow.version}`,
    description: input.description ?? flow.description,
    voteScope: input.voteScope ?? proposalDefaults.voteScope,
    state: input.state ?? proposalDefaults.state,
    holdUpSeconds: input.holdUpSeconds ?? proposalDefaults.holdUpSeconds,
    votingEndsAt: new Date(Date.now() + (input.votingDurationHours ?? proposalDefaults.votingDurationHours) * 3600 * 1000),
    instructions: compilation.instructions.map((instruction) => ({
      index: instruction.index,
      kind: instruction.kind,
      label: instruction.label,
      programId: instruction.programId,
      accounts: instruction.accounts,
      accountMetas: instruction.accountMetas,
      dataBase64: instruction.dataBase64,
      riskScore: instruction.riskScore,
    })),
    automation: {
      autoExecute: input.automation?.autoExecute ?? proposalDefaults.autoExecute,
      executeAfterHoldUp: input.automation?.executeAfterHoldUp ?? proposalDefaults.executeAfterHoldUp,
      maxRiskScore: input.automation?.maxRiskScore ?? proposalDefaults.maxRiskScore,
    },
    onchainExecution: input.onchainExecution
      ? {
          enabled: input.onchainExecution.enabled,
          governanceProgramId: input.onchainExecution.governanceProgramId,
          programVersion: input.onchainExecution.programVersion,
          governanceAddress: input.onchainExecution.governanceAddress,
          proposalAddress: input.onchainExecution.proposalAddress,
          transactionAddresses: input.onchainExecution.transactionAddresses,
          rpcUrl: input.onchainExecution.rpcUrl,
          requireSimulation: input.onchainExecution.requireSimulation,
        }
      : undefined,
  };

  const proposal = await createProposal(proposalInput, userId);
  let onchainCreation:
    | {
        signatures: string[];
        onchainProposalAddress: string | null;
        onchainTransactionAddresses: string[];
      }
    | undefined;
  let onchainCreationError: string | undefined;

  if (resolvedOnchainCreate?.enabled) {
    try {
      const onchainResult = await createProposalOnchain(proposal.id, {
        governanceProgramId: resolvedOnchainCreate.governanceProgramId,
        programVersion: resolvedOnchainCreate.programVersion,
        realmAddress: resolvedOnchainCreate.realmAddress,
        governanceAddress: resolvedOnchainCreate.governanceAddress,
        governingTokenMint: resolvedOnchainCreate.governingTokenMint,
        descriptionLink: resolvedOnchainCreate.descriptionLink,
        optionIndex: resolvedOnchainCreate.optionIndex,
        useDenyOption: resolvedOnchainCreate.useDenyOption,
        rpcUrl: resolvedOnchainCreate.rpcUrl,
        signOff: resolvedOnchainCreate.signOff,
        requireSimulation: resolvedOnchainCreate.requireSimulation,
      }, userId);

      onchainCreation = {
        signatures: onchainResult.signatures,
        onchainProposalAddress: onchainResult.proposal.onchainExecution.proposalAddress,
        onchainTransactionAddresses: onchainResult.proposal.onchainExecution.transactionAddresses,
      };
    } catch (error) {
      onchainCreationError = error instanceof Error ? error.message : 'Unknown onchain creation error';
    }
  }

  flow.status = 'published';
  flow.lastPublishedProposalId = proposal._id;
  flow.latestCompilation = buildCompilationSnapshot(compilation);
  flow.updatedBy = userId;
  await flow.save();

  return {
    flow,
    proposalId: proposal.id,
    compilation,
    onchainCreation,
    onchainCreationError,
  };
};
