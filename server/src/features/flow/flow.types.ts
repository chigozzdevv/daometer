export type FlowVoteScope = 'community' | 'council';
export type ProposalStateInput = 'draft' | 'voting';

export interface FlowGraphNode {
  id: string;
  x: number;
  y: number;
}

export interface FlowGraphEdge {
  id: string;
  source: string;
  target: string;
}

export interface FlowGraph {
  nodes: FlowGraphNode[];
  edges: FlowGraphEdge[];
}

export interface FlowBlockBase {
  id: string;
  label: string;
  note?: string;
}

export interface TransferSolBlock extends FlowBlockBase {
  type: 'transfer-sol';
  fromGovernance: string;
  toWallet: string;
  lamports: number;
}

export interface TransferSplBlock extends FlowBlockBase {
  type: 'transfer-spl';
  tokenMint: string;
  fromTokenAccount: string;
  toTokenAccount: string;
  amount: string;
  decimals: number;
}

export interface SetGovernanceConfigBlock extends FlowBlockBase {
  type: 'set-governance-config';
  governanceAddress: string;
  yesVoteThresholdPercent: number;
  baseVotingTimeSeconds: number;
  minInstructionHoldUpTimeSeconds: number;
  communityVetoThresholdPercent?: number;
}

export interface ProgramUpgradeBlock extends FlowBlockBase {
  type: 'program-upgrade';
  programId: string;
  bufferAddress: string;
  spillAddress: string;
}

export interface CreateStreamBlock extends FlowBlockBase {
  type: 'create-stream';
  streamProgramId: string;
  treasuryTokenAccount: string;
  recipientWallet: string;
  tokenMint: string;
  totalAmount: string;
  startAt: string;
  endAt: string;
  canCancel: boolean;
  instructionDataBase64?: string;
  accountMetas?: Array<{
    pubkey: string;
    isSigner: boolean;
    isWritable: boolean;
  }>;
}

export interface CustomInstructionBlock extends FlowBlockBase {
  type: 'custom-instruction';
  programId: string;
  accounts: Array<{
    pubkey: string;
    isSigner: boolean;
    isWritable: boolean;
  }>;
  dataBase64: string;
  kind: 'custom' | 'defi' | 'governance';
}

export type FlowBlock =
  | TransferSolBlock
  | TransferSplBlock
  | SetGovernanceConfigBlock
  | ProgramUpgradeBlock
  | CreateStreamBlock
  | CustomInstructionBlock;

export interface FlowProposalDefaults {
  titlePrefix: string;
  voteScope: FlowVoteScope;
  state: ProposalStateInput;
  holdUpSeconds: number;
  votingDurationHours: number;
  autoExecute: boolean;
  executeAfterHoldUp: boolean;
  maxRiskScore: number;
}

export interface FlowCompileContext {
  nativeTreasuryLamports?: number;
  tokenTreasuryBalances?: Array<{
    mint: string;
    amount: string;
    decimals: number;
  }>;
  governanceProgramId?: string;
}

export interface CompiledFlowInstruction {
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
}

export interface FlowCompilationResult {
  instructions: CompiledFlowInstruction[];
  warnings: string[];
  riskScore: number;
  riskLevel: 'safe' | 'warning' | 'critical';
}
