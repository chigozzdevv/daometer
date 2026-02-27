import { apiRequest } from '@/shared/lib/api-client';

export type DaoItem = {
  id: string;
  createdBy: string;
  name: string;
  slug: string;
  network: 'mainnet-beta' | 'devnet';
  realmAddress: string;
  description?: string;
  governanceProgramId: string;
  authorityWallet: string;
  communityMint: string | null;
  councilMint: string | null;
  automationConfig: {
    autoExecuteEnabled: boolean;
    maxRiskScore: number;
    requireSimulation: boolean;
  };
  createdAt: string;
  updatedAt: string;
};

export type CreateDaoInput = {
  name: string;
  description?: string;
  network: 'mainnet-beta' | 'devnet';
  realmAddress: string;
  governanceProgramId: string;
  authorityWallet: string;
  communityMint?: string;
  councilMint?: string;
  slug?: string;
};

export type DaoGovernanceItem = {
  address: string;
  governedAccount: string | null;
  nativeTreasuryAddress: string;
};

export type DaoGovernancesResponse = {
  daoId: string;
  realmAddress: string;
  governanceProgramId: string;
  network: 'mainnet-beta' | 'devnet';
  rpcUrl: string;
  items: DaoGovernanceItem[];
};

export type PrepareDaoOnchainInput = {
  name: string;
  network: 'mainnet-beta' | 'devnet';
  communityMint: string;
  councilMint?: string;
  governanceProgramId?: string;
  authorityWallet?: string;
  rpcUrl?: string;
  programVersion?: number;
};

export type PrepareDaoOnchainResult = {
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
};

export type PrepareCommunityMintInput = {
  name: string;
  network: 'mainnet-beta' | 'devnet';
  authorityWallet?: string;
  decimals?: number;
  rpcUrl?: string;
};

export type PrepareCommunityMintResult = {
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
};

export type FlowItem = {
  id: string;
  daoId: string;
  name: string;
  slug: string;
  status: 'draft' | 'published' | 'archived';
  description?: string;
  tags?: string[];
  version: number;
  blocks: FlowBlockInput[];
  graph: FlowGraph | null;
  proposalDefaults: FlowProposalDefaults;
  latestCompilation: {
    compiledAt: string;
    riskScore: number;
    riskLevel: 'safe' | 'warning' | 'critical';
    warnings: string[];
    instructionCount: number;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type ProposalItem = {
  id: string;
  daoId: string;
  title: string;
  state: 'draft' | 'voting' | 'succeeded' | 'defeated' | 'cancelled' | 'executed' | 'execution-error';
  voteScope: 'community' | 'council';
  riskScore: number;
  riskLevel: 'safe' | 'warning' | 'critical';
  holdUpSeconds: number;
  votingEndsAt: string;
  executionError: string | null;
  onchainExecution: {
    enabled: boolean;
    governanceAddress: string | null;
    proposalAddress: string | null;
    transactionAddresses: string[];
  };
  manualApproval: {
    required: boolean;
    approved: boolean | null;
  };
  createdAt: string;
  updatedAt: string;
};

export type CreateProposalInput = {
  daoId: string;
  title: string;
  description?: string;
  voteScope?: 'community' | 'council';
  state?: 'draft' | 'voting';
  holdUpSeconds?: number;
  votingEndsAt: string;
  instructions: Array<{
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
  }>;
  automation?: {
    autoExecute?: boolean;
    executeAfterHoldUp?: boolean;
    maxRiskScore?: number;
  };
};

export type CreateProposalOnchainInput = {
  governanceProgramId?: string;
  programVersion: number;
  realmAddress: string;
  governanceAddress: string;
  governingTokenMint: string;
  descriptionLink?: string;
  optionIndex?: number;
  useDenyOption?: boolean;
  rpcUrl?: string;
  signOff?: boolean;
  requireSimulation?: boolean;
};

export type CreateProposalOnchainResult = {
  proposal: ProposalItem;
  signatures: string[];
};

export type WorkflowItem = {
  id: string;
  daoId: string;
  name: string;
  description: string;
  enabled: boolean;
  trigger: {
    type: 'proposal-state-changed' | 'voting-ends-in' | 'hold-up-expires-in';
    states: Array<
      'draft' | 'voting' | 'succeeded' | 'defeated' | 'cancelled' | 'executed' | 'execution-error'
    >;
    offsetMinutes: number;
  };
  actions: {
    onTrue: Array<{ type: string; enabled: boolean }>;
    onFalse: Array<{ type: string; enabled: boolean }>;
  };
  createdAt: string;
  updatedAt: string;
};

export type WorkflowEventItem = {
  id: string;
  workflowRuleId: string;
  proposalId: string;
  triggerType: 'proposal-state-changed' | 'voting-ends-in' | 'hold-up-expires-in';
  matched: boolean;
  firedAt: string;
  error?: string | null;
  context?: Record<string, unknown>;
  actionResults: Array<{
    type: string;
    status: 'success' | 'failed' | 'skipped';
    message: string;
  }>;
};

export type ExecutionJobItem = {
  id: string;
  daoId: string;
  proposalId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  attemptCount: number;
  maxRetries: number;
  nextRunAt: string;
  lockExpiresAt: string | null;
  executionReference: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AuthProfile = {
  id: string;
  walletAddress: string;
  displayName: string | null;
  roles: string[];
};

export type FlowBlockInput = Record<string, unknown>;

export type FlowGraphNode = {
  id: string;
  x: number;
  y: number;
};

export type FlowGraphEdge = {
  id: string;
  source: string;
  target: string;
};

export type FlowGraph = {
  nodes: FlowGraphNode[];
  edges: FlowGraphEdge[];
};

export type FlowProposalDefaults = {
  titlePrefix: string;
  voteScope: 'community' | 'council';
  state: 'draft' | 'voting';
  holdUpSeconds: number;
  votingDurationHours: number;
  autoExecute: boolean;
  executeAfterHoldUp: boolean;
  maxRiskScore: number;
};

export type FlowCompileContext = {
  nativeTreasuryLamports?: number;
  tokenTreasuryBalances?: Array<{
    mint: string;
    amount: string;
    decimals: number;
  }>;
  governanceProgramId?: string;
};

export type FlowCompilationResult = {
  instructions: Array<{
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
    dataBase64: string;
    riskScore: number;
    riskLevel: 'safe' | 'warning' | 'critical';
    warnings: string[];
  }>;
  warnings: string[];
  riskScore: number;
  riskLevel: 'safe' | 'warning' | 'critical';
};

export type CreateFlowInput = {
  daoId: string;
  name: string;
  description?: string;
  tags?: string[];
  blocks: FlowBlockInput[];
  graph?: FlowGraph;
  proposalDefaults?: Partial<FlowProposalDefaults>;
};

export type UpdateFlowInput = {
  name?: string;
  description?: string;
  tags?: string[];
  blocks?: FlowBlockInput[];
  graph?: FlowGraph;
  proposalDefaults?: Partial<FlowProposalDefaults>;
  status?: 'draft' | 'published' | 'archived';
};

export type PublishFlowInput = {
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

export type PublishFlowResult = {
  flow: FlowItem;
  proposalId: string;
  compilation: FlowCompilationResult;
  onchainCreation?: {
    signatures: string[];
    onchainProposalAddress: string | null;
    onchainTransactionAddresses: string[];
  };
  onchainCreationError?: string;
};

type ListOptions = {
  page?: number;
  limit?: number;
};

type FlowListOptions = ListOptions & {
  daoId?: string;
  status?: 'draft' | 'published' | 'archived';
};

type ProposalListOptions = ListOptions & {
  state?: 'draft' | 'voting' | 'succeeded' | 'defeated' | 'cancelled' | 'executed' | 'execution-error';
};

type ExecutionJobListOptions = ListOptions & {
  daoId?: string;
  status?: 'pending' | 'running' | 'completed' | 'failed';
};

const buildQuery = (params: Record<string, string | number | boolean | undefined>): string => {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }

    searchParams.set(key, String(value));
  });

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
};

export const getAuthProfile = async (accessToken: string): Promise<AuthProfile> =>
  apiRequest<AuthProfile>('/auth/me', {
    accessToken,
  });

export const getDaos = async (options: ListOptions = {}): Promise<DaoItem[]> =>
  apiRequest<DaoItem[]>(
    `/daos${buildQuery({
      page: options.page ?? 1,
      limit: options.limit ?? 100,
    })}`,
  );

export const getDaoById = async (daoId: string): Promise<DaoItem> => apiRequest<DaoItem>(`/daos/${daoId}`);

export const createDao = async (input: CreateDaoInput, accessToken: string): Promise<DaoItem> =>
  apiRequest<DaoItem>('/daos', {
    method: 'POST',
    body: input,
    accessToken,
  });

export const getDaoGovernances = async (daoId: string): Promise<DaoGovernancesResponse> =>
  apiRequest<DaoGovernancesResponse>(`/daos/${daoId}/governances`);

export const prepareDaoOnchainCreate = async (
  input: PrepareDaoOnchainInput,
  accessToken: string,
): Promise<PrepareDaoOnchainResult> =>
  apiRequest<PrepareDaoOnchainResult>('/daos/onchain-create', {
    method: 'POST',
    body: input,
    accessToken,
  });

export const prepareCommunityMint = async (
  input: PrepareCommunityMintInput,
  accessToken: string,
): Promise<PrepareCommunityMintResult> =>
  apiRequest<PrepareCommunityMintResult>('/daos/prepare-community-mint', {
    method: 'POST',
    body: input,
    accessToken,
  });

export const getFlows = async (options: FlowListOptions = {}): Promise<FlowItem[]> =>
  apiRequest<FlowItem[]>(
    `/flows${buildQuery({
      page: options.page ?? 1,
      limit: options.limit ?? 100,
      daoId: options.daoId,
      status: options.status,
    })}`,
  );

export const getFlowById = async (flowId: string): Promise<FlowItem> => apiRequest<FlowItem>(`/flows/${flowId}`);

export const createFlow = async (input: CreateFlowInput, accessToken: string): Promise<FlowItem> =>
  apiRequest<FlowItem>('/flows', {
    method: 'POST',
    body: input,
    accessToken,
  });

export const updateFlow = async (flowId: string, input: UpdateFlowInput, accessToken: string): Promise<FlowItem> =>
  apiRequest<FlowItem>(`/flows/${flowId}`, {
    method: 'PATCH',
    body: input,
    accessToken,
  });

export const compileFlowById = async (
  flowId: string,
  context: FlowCompileContext,
  accessToken: string,
): Promise<FlowCompilationResult> =>
  apiRequest<FlowCompilationResult>(`/flows/${flowId}/compile`, {
    method: 'POST',
    body: { context },
    accessToken,
  });

export const compileInlineFlow = async (
  blocks: FlowBlockInput[],
  context: FlowCompileContext,
  accessToken: string,
): Promise<FlowCompilationResult> =>
  apiRequest<FlowCompilationResult>('/flows/compile-inline', {
    method: 'POST',
    body: { blocks, context },
    accessToken,
  });

export const publishFlow = async (
  flowId: string,
  input: PublishFlowInput,
  accessToken: string,
): Promise<PublishFlowResult> =>
  apiRequest<PublishFlowResult>(`/flows/${flowId}/publish`, {
    method: 'POST',
    body: input,
    accessToken,
  });

export const getDaoProposals = async (daoId: string, options: ProposalListOptions = {}): Promise<ProposalItem[]> =>
  apiRequest<ProposalItem[]>(
    `/proposals/dao/${daoId}${buildQuery({
      page: options.page ?? 1,
      limit: options.limit ?? 100,
      state: options.state,
    })}`,
  );

export const createProposal = async (
  input: CreateProposalInput,
  accessToken: string,
): Promise<ProposalItem> =>
  apiRequest<ProposalItem>('/proposals', {
    method: 'POST',
    body: input as unknown as Record<string, unknown>,
    accessToken,
  });

export const createProposalOnchain = async (
  proposalId: string,
  input: CreateProposalOnchainInput,
  accessToken: string,
): Promise<CreateProposalOnchainResult> =>
  apiRequest<CreateProposalOnchainResult>(`/proposals/${proposalId}/onchain-create`, {
    method: 'POST',
    body: {
      ...input,
      optionIndex: input.optionIndex ?? 0,
      useDenyOption: input.useDenyOption ?? true,
      signOff: input.signOff ?? true,
      requireSimulation: input.requireSimulation ?? true,
    },
    accessToken,
  });

export const getWorkflows = async (
  daoId: string,
  accessToken: string,
  options: ListOptions & { enabled?: boolean } = {},
): Promise<WorkflowItem[]> =>
  apiRequest<WorkflowItem[]>(
    `/workflows${buildQuery({
      daoId,
      enabled: options.enabled,
      page: options.page ?? 1,
      limit: options.limit ?? 100,
    })}`,
    {
      accessToken,
    },
  );

export const getWorkflowEvents = async (
  workflowRuleId: string,
  accessToken: string,
  options: ListOptions = {},
): Promise<WorkflowEventItem[]> =>
  apiRequest<WorkflowEventItem[]>(
    `/workflows/${workflowRuleId}/events${buildQuery({
      page: options.page ?? 1,
      limit: options.limit ?? 100,
    })}`,
    {
      accessToken,
    },
  );

export const getExecutionJobs = async (
  accessToken: string,
  options: ExecutionJobListOptions = {},
): Promise<ExecutionJobItem[]> =>
  apiRequest<ExecutionJobItem[]>(
    `/execution-jobs${buildQuery({
      page: options.page ?? 1,
      limit: options.limit ?? 100,
      daoId: options.daoId,
      status: options.status,
    })}`,
    {
      accessToken,
    },
  );
