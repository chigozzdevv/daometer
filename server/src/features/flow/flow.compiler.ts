import { SOLANA_PROGRAM_IDS } from '@/config/solana.config';
import { PublicKey } from '@solana/web3.js';
import type {
  CompiledFlowInstruction,
  FlowBlock,
  FlowCompilationResult,
  FlowCompileContext,
  TransferSolBlock,
  TransferSplBlock,
  SetGovernanceConfigBlock,
  ProgramUpgradeBlock,
  CreateTokenAccountBlock,
  CreateStreamBlock,
  CustomInstructionBlock,
} from '@/features/flow/flow.types';

const toRiskLevel = (score: number): 'safe' | 'warning' | 'critical' => {
  if (score <= 30) {
    return 'safe';
  }

  if (score <= 70) {
    return 'warning';
  }

  return 'critical';
};

const encodePayload = (payload: unknown): string => Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');

const parseDecimalToNumber = (value: string): number => {
  const normalized = value.trim();

  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return Number.NaN;
  }

  return Number(normalized);
};

const compileTransferSol = (
  block: TransferSolBlock,
  index: number,
  context: FlowCompileContext,
): CompiledFlowInstruction => {
  let riskScore = 35;
  const warnings: string[] = [];

  if (block.lamports <= 0) {
    riskScore = 100;
    warnings.push('Transfer amount must be greater than zero');
  }

  if (block.lamports >= 10 * 1_000_000_000) {
    riskScore += 15;
    warnings.push('Transfer exceeds 10 SOL');
  }

  if (context.nativeTreasuryLamports && context.nativeTreasuryLamports > 0) {
    const treasuryPercent = (block.lamports / context.nativeTreasuryLamports) * 100;

    if (treasuryPercent >= 20) {
      riskScore += 25;
      warnings.push(`Transfer is ${treasuryPercent.toFixed(2)}% of treasury`);
    } else if (treasuryPercent >= 10) {
      riskScore += 15;
      warnings.push(`Transfer is ${treasuryPercent.toFixed(2)}% of treasury`);
    }
  }

  const cappedRisk = Math.min(100, riskScore);

  return {
    index,
    kind: 'transfer',
    label: block.label,
    programId: SOLANA_PROGRAM_IDS.systemProgram,
    accounts: [block.fromGovernance, block.toWallet],
    dataBase64: encodePayload({
      operation: 'transfer-sol',
      lamports: block.lamports,
      fromGovernance: block.fromGovernance,
      toWallet: block.toWallet,
    }),
    riskScore: cappedRisk,
    riskLevel: toRiskLevel(cappedRisk),
    warnings,
  };
};

const compileTransferSpl = (
  block: TransferSplBlock,
  index: number,
  context: FlowCompileContext,
): CompiledFlowInstruction => {
  let riskScore = 30;
  const warnings: string[] = [];

  const amount = parseDecimalToNumber(block.amount);

  if (Number.isNaN(amount) || amount <= 0) {
    riskScore = 100;
    warnings.push('Token transfer amount is invalid');
  }

  if (amount >= 100_000) {
    riskScore += 20;
    warnings.push('Transfer amount exceeds 100000 tokens');
  } else if (amount >= 10_000) {
    riskScore += 10;
    warnings.push('Transfer amount exceeds 10000 tokens');
  }

  const matchingBalance = context.tokenTreasuryBalances?.find((balance) => balance.mint === block.tokenMint);

  if (matchingBalance) {
    const treasuryAmount = parseDecimalToNumber(matchingBalance.amount);

    if (!Number.isNaN(treasuryAmount) && treasuryAmount > 0 && !Number.isNaN(amount)) {
      const treasuryPercent = (amount / treasuryAmount) * 100;

      if (treasuryPercent >= 25) {
        riskScore += 25;
        warnings.push(`Transfer is ${treasuryPercent.toFixed(2)}% of token treasury`);
      } else if (treasuryPercent >= 10) {
        riskScore += 12;
        warnings.push(`Transfer is ${treasuryPercent.toFixed(2)}% of token treasury`);
      }
    }
  }

  const cappedRisk = Math.min(100, riskScore);

  return {
    index,
    kind: 'transfer',
    label: block.label,
    programId: SOLANA_PROGRAM_IDS.tokenProgram,
    accounts: [block.fromTokenAccount, block.toTokenAccount],
    dataBase64: encodePayload({
      operation: 'transfer-spl',
      tokenMint: block.tokenMint,
      amount: block.amount,
      decimals: block.decimals,
      fromTokenAccount: block.fromTokenAccount,
      toTokenAccount: block.toTokenAccount,
    }),
    riskScore: cappedRisk,
    riskLevel: toRiskLevel(cappedRisk),
    warnings,
  };
};

const compileSetGovernanceConfig = (
  block: SetGovernanceConfigBlock,
  index: number,
  context: FlowCompileContext,
): CompiledFlowInstruction => {
  let riskScore = 55;
  const warnings: string[] = [];

  if (block.yesVoteThresholdPercent < 50) {
    riskScore += 20;
    warnings.push('Yes vote threshold is below 50%');
  }

  if (block.minInstructionHoldUpTimeSeconds < 3600) {
    riskScore += 15;
    warnings.push('Hold-up time is below one hour');
  }

  if (block.baseVotingTimeSeconds < 24 * 3600) {
    riskScore += 12;
    warnings.push('Voting time is below 24 hours');
  }

  const cappedRisk = Math.min(100, riskScore);

  return {
    index,
    kind: 'config',
    label: block.label,
    programId: context.governanceProgramId ?? SOLANA_PROGRAM_IDS.governanceProgram,
    accounts: [block.governanceAddress],
    dataBase64: encodePayload({
      operation: 'set-governance-config',
      governanceAddress: block.governanceAddress,
      yesVoteThresholdPercent: block.yesVoteThresholdPercent,
      baseVotingTimeSeconds: block.baseVotingTimeSeconds,
      minInstructionHoldUpTimeSeconds: block.minInstructionHoldUpTimeSeconds,
      communityVetoThresholdPercent: block.communityVetoThresholdPercent,
    }),
    riskScore: cappedRisk,
    riskLevel: toRiskLevel(cappedRisk),
    warnings,
  };
};

const compileProgramUpgrade = (block: ProgramUpgradeBlock, index: number): CompiledFlowInstruction => {
  let riskScore = 78;
  const warnings: string[] = ['Program upgrades are irreversible and should be audited'];

  if (block.programId === block.bufferAddress) {
    riskScore = 100;
    warnings.push('Program id and buffer address must be different');
  }

  const cappedRisk = Math.min(100, riskScore);

  return {
    index,
    kind: 'program-upgrade',
    label: block.label,
    programId: SOLANA_PROGRAM_IDS.bpfLoaderUpgradeable,
    accounts: [block.programId, block.bufferAddress, block.spillAddress],
    dataBase64: encodePayload({
      operation: 'program-upgrade',
      programId: block.programId,
      bufferAddress: block.bufferAddress,
      spillAddress: block.spillAddress,
    }),
    riskScore: cappedRisk,
    riskLevel: toRiskLevel(cappedRisk),
    warnings,
  };
};

const compileCreateTokenAccount = (block: CreateTokenAccountBlock, index: number): CompiledFlowInstruction => {
  let riskScore = 22;
  const warnings: string[] = [];

  const tokenProgramId = block.tokenProgramId ?? SOLANA_PROGRAM_IDS.tokenProgram;
  const associatedTokenProgramId = block.associatedTokenProgramId ?? SOLANA_PROGRAM_IDS.associatedTokenProgram;

  let ataAddress: string | null = null;

  try {
    const owner = new PublicKey(block.owner);
    const mint = new PublicKey(block.mint);
    const tokenProgram = new PublicKey(tokenProgramId);
    const associatedProgram = new PublicKey(associatedTokenProgramId);
    ataAddress = PublicKey.findProgramAddressSync(
      [owner.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
      associatedProgram,
    )[0].toBase58();
  } catch {
    riskScore = 100;
    warnings.push('Unable to derive associated token account address from provided keys');
  }

  if (block.payer !== block.owner) {
    riskScore += 8;
    warnings.push('Payer differs from owner. Ensure payer is expected to fund ATA creation');
  }

  const cappedRisk = Math.min(100, riskScore);

  return {
    index,
    kind: 'custom',
    label: block.label,
    programId: associatedTokenProgramId,
    accounts: [
      block.payer,
      ataAddress ?? block.owner,
      block.owner,
      block.mint,
      SOLANA_PROGRAM_IDS.systemProgram,
      tokenProgramId,
      SOLANA_PROGRAM_IDS.rentSysvar,
    ],
    accountMetas: [
      { pubkey: block.payer, isSigner: true, isWritable: true },
      { pubkey: ataAddress ?? block.owner, isSigner: false, isWritable: true },
      { pubkey: block.owner, isSigner: false, isWritable: false },
      { pubkey: block.mint, isSigner: false, isWritable: false },
      { pubkey: SOLANA_PROGRAM_IDS.systemProgram, isSigner: false, isWritable: false },
      { pubkey: tokenProgramId, isSigner: false, isWritable: false },
      { pubkey: SOLANA_PROGRAM_IDS.rentSysvar, isSigner: false, isWritable: false },
    ],
    dataBase64: '',
    riskScore: cappedRisk,
    riskLevel: toRiskLevel(cappedRisk),
    warnings,
  };
};

const compileCreateStream = (block: CreateStreamBlock, index: number): CompiledFlowInstruction => {
  let riskScore = 28;
  const warnings: string[] = [];

  const startAt = new Date(block.startAt);
  const endAt = new Date(block.endAt);

  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt.getTime() <= startAt.getTime()) {
    riskScore = 100;
    warnings.push('Stream schedule is invalid');
  }

  const totalAmount = parseDecimalToNumber(block.totalAmount);

  if (Number.isNaN(totalAmount) || totalAmount <= 0) {
    riskScore = 100;
    warnings.push('Stream amount is invalid');
  }

  if (!block.canCancel) {
    riskScore += 10;
    warnings.push('Non-cancelable stream increases treasury exposure');
  }

  const hasCompiledInstruction = Boolean(block.instructionDataBase64 && block.accountMetas && block.accountMetas.length > 0);

  if (!hasCompiledInstruction) {
    riskScore += 12;
    warnings.push('Stream block needs instructionDataBase64 + accountMetas for auto onchain creation');
  }

  const cappedRisk = Math.min(100, riskScore);

  return {
    index,
    kind: 'stream',
    label: block.label,
    programId: block.streamProgramId,
    accounts: hasCompiledInstruction
      ? block.accountMetas!.map((accountMeta) => accountMeta.pubkey)
      : [block.treasuryTokenAccount, block.recipientWallet],
    accountMetas: hasCompiledInstruction ? block.accountMetas : undefined,
    dataBase64: encodePayload({
      operation: 'create-stream',
      treasuryTokenAccount: block.treasuryTokenAccount,
      recipientWallet: block.recipientWallet,
      tokenMint: block.tokenMint,
      totalAmount: block.totalAmount,
      startAt: block.startAt,
      endAt: block.endAt,
      canCancel: block.canCancel,
      instructionDataBase64: block.instructionDataBase64,
      accountMetas: block.accountMetas,
    }),
    riskScore: cappedRisk,
    riskLevel: toRiskLevel(cappedRisk),
    warnings,
  };
};

const compileCustomInstruction = (block: CustomInstructionBlock, index: number): CompiledFlowInstruction => {
  let riskScore = 65;
  const warnings: string[] = ['Custom instructions require manual review'];

  if (block.accounts.length === 0) {
    riskScore += 20;
    warnings.push('Custom instruction has no account metadata');
  }

  const cappedRisk = Math.min(100, riskScore);

  return {
    index,
    kind: 'custom',
    label: block.label,
    programId: block.programId,
    accounts: block.accounts.map((account) => account.pubkey),
    accountMetas: block.accounts,
    dataBase64: block.dataBase64,
    riskScore: cappedRisk,
    riskLevel: toRiskLevel(cappedRisk),
    warnings,
  };
};

const compileBlock = (block: FlowBlock, index: number, context: FlowCompileContext): CompiledFlowInstruction => {
  if (block.type === 'transfer-sol') {
    return compileTransferSol(block, index, context);
  }

  if (block.type === 'transfer-spl') {
    return compileTransferSpl(block, index, context);
  }

  if (block.type === 'set-governance-config') {
    return compileSetGovernanceConfig(block, index, context);
  }

  if (block.type === 'program-upgrade') {
    return compileProgramUpgrade(block, index);
  }

  if (block.type === 'create-token-account') {
    return compileCreateTokenAccount(block, index);
  }

  if (block.type === 'create-stream') {
    return compileCreateStream(block, index);
  }

  return compileCustomInstruction(block, index);
};

export const compileFlowBlocks = (blocks: FlowBlock[], context: FlowCompileContext = {}): FlowCompilationResult => {
  const instructions = blocks.map((block, index) => compileBlock(block, index, context));
  const riskScore = instructions.reduce((maxScore, instruction) => Math.max(maxScore, instruction.riskScore), 0);
  const warnings = [...new Set(instructions.flatMap((instruction) => instruction.warnings))];

  return {
    instructions,
    warnings,
    riskScore,
    riskLevel: toRiskLevel(riskScore),
  };
};
