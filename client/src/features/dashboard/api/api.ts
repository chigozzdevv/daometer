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
  defaultGovernanceAddress: string | null;
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
  defaultGovernanceAddress?: string;
  authorityWallet: string;
  communityMint?: string;
  councilMint?: string;
  slug?: string;
};

export type UpdateDaoInput = {
  name?: string;
  description?: string;
  defaultGovernanceAddress?: string | null;
  automationConfig?: {
    autoExecuteEnabled?: boolean;
    maxRiskScore?: number;
    requireSimulation?: boolean;
  };
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

export type PrepareDaoGovernanceInput = {
  createAuthorityWallet?: string;
  voteScope?: 'community' | 'council';
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
  programVersion?: number;
};

export type PrepareDaoGovernanceResult = {
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
};

export type PreparedWalletTransactionResult = {
  label: string;
  transactionMessage: string;
  transactionBase58: string;
  transactionBase64: string;
  recentBlockhash: string;
  lastValidBlockHeight: number;
  network: 'mainnet-beta' | 'devnet';
  rpcUrl: string;
};

export type PrepareMintDistributionInput = {
  mintAddress: string;
  recipientWallet: string;
  amount: string;
  decimals: number;
  authorityWallet?: string;
  payerWallet?: string;
  createAssociatedTokenAccount?: boolean;
  rpcUrl?: string;
};

export type PrepareMintDistributionResult = PreparedWalletTransactionResult & {
  authorityWallet: string;
  payerWallet: string;
  mintAddress: string;
  recipientWallet: string;
  recipientTokenAccount: string;
  amount: string;
  decimals: number;
};

export type PrepareMintAuthorityInput = {
  mintAddress: string;
  currentAuthorityWallet?: string;
  newAuthorityWallet?: string | null;
  rpcUrl?: string;
};

export type PrepareMintAuthorityResult = PreparedWalletTransactionResult & {
  currentAuthorityWallet: string;
  mintAddress: string;
  newAuthorityWallet: string | null;
};

export type PrepareVotingDepositInput = {
  voteScope?: 'community' | 'council';
  governingTokenMint?: string;
  amount: string;
  decimals: number;
  tokenSourceAccount?: string;
  governingTokenOwnerWallet?: string;
  payerWallet?: string;
  rpcUrl?: string;
  programVersion?: number;
};

export type PrepareVotingDepositResult = PreparedWalletTransactionResult & {
  governingTokenMint: string;
  tokenOwnerRecordAddress: string;
  governingTokenOwnerWallet: string;
  tokenSourceAccount: string;
  amount: string;
  decimals: number;
};

export type PrepareVotingWithdrawInput = {
  voteScope?: 'community' | 'council';
  governingTokenMint?: string;
  destinationTokenAccount?: string;
  governingTokenOwnerWallet?: string;
  payerWallet?: string;
  createDestinationAta?: boolean;
  rpcUrl?: string;
  programVersion?: number;
};

export type PrepareVotingWithdrawResult = PreparedWalletTransactionResult & {
  governingTokenMint: string;
  governingTokenOwnerWallet: string;
  destinationTokenAccount: string;
};

export type PrepareVotingDelegateInput = {
  voteScope?: 'community' | 'council';
  governingTokenMint?: string;
  governingTokenOwnerWallet?: string;
  newDelegateWallet?: string | null;
  rpcUrl?: string;
  programVersion?: number;
};

export type PrepareVotingDelegateResult = PreparedWalletTransactionResult & {
  governingTokenMint: string;
  governingTokenOwnerWallet: string;
  newDelegateWallet: string | null;
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

export type WorkflowTriggerType = 'proposal-state-changed' | 'voting-ends-in' | 'hold-up-expires-in';
export type WorkflowProposalState =
  | 'draft'
  | 'voting'
  | 'succeeded'
  | 'defeated'
  | 'cancelled'
  | 'executed'
  | 'execution-error';
export type WorkflowActionType = 'send-email' | 'enqueue-execution' | 'set-manual-approval' | 'execute-now';

export type WorkflowItem = {
  id: string;
  daoId: string;
  name: string;
  description: string;
  enabled: boolean;
  trigger: {
    type: WorkflowTriggerType;
    states: WorkflowProposalState[];
    offsetMinutes: number;
  };
  conditions: {
    mode: 'all' | 'any';
    rules: Array<{
      field: string;
      operator: string;
      value: unknown;
    }>;
  };
  actions: {
    onTrue: Array<{ type: WorkflowActionType; enabled: boolean; config?: Record<string, unknown> }>;
    onFalse: Array<{ type: WorkflowActionType; enabled: boolean; config?: Record<string, unknown> }>;
  };
  createdAt: string;
  updatedAt: string;
};

export type CreateWorkflowInput = {
  daoId: string;
  name: string;
  description?: string;
  enabled?: boolean;
  trigger: {
    type: WorkflowTriggerType;
    states: WorkflowProposalState[];
    offsetMinutes: number;
  };
  filters?: {
    voteScope?: 'community' | 'council' | null;
    minRiskScore?: number | null;
    maxRiskScore?: number | null;
    onchainExecutionEnabled?: boolean | null;
  };
  conditions?: {
    mode: 'all' | 'any';
    rules: Array<{
      field: string;
      operator: string;
      value: unknown;
    }>;
  };
  actions: {
    onTrue: Array<{
      type: WorkflowActionType;
      enabled: boolean;
      config: Record<string, unknown>;
    }>;
    onFalse: Array<{
      type: WorkflowActionType;
      enabled: boolean;
      config: Record<string, unknown>;
    }>;
  };
};

export type UpdateWorkflowInput = Partial<Omit<CreateWorkflowInput, 'daoId'>>;

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
    realmAddress?: string;
    governanceAddress?: string;
    governingTokenMint?: string;
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
  onchainPreparation?: {
    proposalAddress: string;
    transactionAddresses: string[];
    preparedTransactions: PreparedTransaction[];
    onchainExecution: ProposalOnchainExecutionInput;
  };
};

export type PreparedTransaction = {
  label: string;
  transactionMessage: string;
  transactionBase58: string;
  transactionBase64: string;
  recentBlockhash: string;
  lastValidBlockHeight: number;
};

export type ProposalOnchainExecutionInput = {
  enabled: boolean;
  governanceProgramId?: string;
  programVersion: number;
  governanceAddress?: string;
  proposalAddress?: string;
  transactionAddresses: string[];
  rpcUrl?: string;
  requireSimulation: boolean;
};

export type PrepareProposalOnchainExecutionResult = {
  proposal: ProposalItem;
  skippedTransactionAddresses: string[];
  preparedTransactions: PreparedTransaction[];
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

export const updateDao = async (daoId: string, input: UpdateDaoInput, accessToken: string): Promise<DaoItem> =>
  apiRequest<DaoItem>(`/daos/${daoId}`, {
    method: 'PATCH',
    body: input as unknown as Record<string, unknown>,
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

export const prepareDaoGovernanceCreate = async (
  daoId: string,
  input: PrepareDaoGovernanceInput,
  accessToken: string,
): Promise<PrepareDaoGovernanceResult> =>
  apiRequest<PrepareDaoGovernanceResult>(`/daos/${daoId}/prepare-governance`, {
    method: 'POST',
    body: input,
    accessToken,
  });

export const prepareMintDistributionTx = async (
  daoId: string,
  input: PrepareMintDistributionInput,
  accessToken: string,
): Promise<PrepareMintDistributionResult> =>
  apiRequest<PrepareMintDistributionResult>(`/daos/${daoId}/prepare-mint-distribution`, {
    method: 'POST',
    body: input as unknown as Record<string, unknown>,
    accessToken,
  });

export const prepareMintAuthorityTx = async (
  daoId: string,
  input: PrepareMintAuthorityInput,
  accessToken: string,
): Promise<PrepareMintAuthorityResult> =>
  apiRequest<PrepareMintAuthorityResult>(`/daos/${daoId}/prepare-mint-authority`, {
    method: 'POST',
    body: input as unknown as Record<string, unknown>,
    accessToken,
  });

export const prepareVotingDepositTx = async (
  daoId: string,
  input: PrepareVotingDepositInput,
  accessToken: string,
): Promise<PrepareVotingDepositResult> =>
  apiRequest<PrepareVotingDepositResult>(`/daos/${daoId}/prepare-voting-deposit`, {
    method: 'POST',
    body: input as unknown as Record<string, unknown>,
    accessToken,
  });

export const prepareVotingWithdrawTx = async (
  daoId: string,
  input: PrepareVotingWithdrawInput,
  accessToken: string,
): Promise<PrepareVotingWithdrawResult> =>
  apiRequest<PrepareVotingWithdrawResult>(`/daos/${daoId}/prepare-voting-withdraw`, {
    method: 'POST',
    body: input as unknown as Record<string, unknown>,
    accessToken,
  });

export const prepareVotingDelegateTx = async (
  daoId: string,
  input: PrepareVotingDelegateInput,
  accessToken: string,
): Promise<PrepareVotingDelegateResult> =>
  apiRequest<PrepareVotingDelegateResult>(`/daos/${daoId}/prepare-voting-delegate`, {
    method: 'POST',
    body: input as unknown as Record<string, unknown>,
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

export const updateProposalOnchainExecution = async (
  proposalId: string,
  input: ProposalOnchainExecutionInput,
  accessToken: string,
): Promise<ProposalItem> =>
  apiRequest<ProposalItem>(`/proposals/${proposalId}/onchain-execution`, {
    method: 'PATCH',
    body: input as unknown as Record<string, unknown>,
    accessToken,
  });

export const prepareProposalOnchainExecution = async (
  proposalId: string,
  accessToken: string,
  input: { rpcUrl?: string } = {},
): Promise<PrepareProposalOnchainExecutionResult> =>
  apiRequest<PrepareProposalOnchainExecutionResult>(`/proposals/${proposalId}/prepare-onchain-execution`, {
    method: 'POST',
    body: input,
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

export const createWorkflow = async (
  input: CreateWorkflowInput,
  accessToken: string,
): Promise<WorkflowItem> =>
  apiRequest<WorkflowItem>('/workflows', {
    method: 'POST',
    body: input as unknown as Record<string, unknown>,
    accessToken,
  });

export const updateWorkflow = async (
  workflowRuleId: string,
  input: UpdateWorkflowInput,
  accessToken: string,
): Promise<WorkflowItem> =>
  apiRequest<WorkflowItem>(`/workflows/${workflowRuleId}`, {
    method: 'PATCH',
    body: input as unknown as Record<string, unknown>,
    accessToken,
  });

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
