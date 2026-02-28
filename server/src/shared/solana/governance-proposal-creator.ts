import {
  createSetGovernanceConfig,
  createInstructionData,
  getGovernance,
  getNativeTreasuryAddress,
  getProgramDataAddress,
  getRealm,
  getTokenOwnerRecord,
  getTokenOwnerRecordAddress,
  GovernanceConfig,
  VoteThreshold,
  VoteThresholdType,
  VoteType,
  withCreateProposal,
  withCreateTokenOwnerRecord,
  withInsertTransaction,
  withSignOffProposal,
} from '@realms-today/spl-governance';
import {
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  Connection,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  type Commitment,
} from '@solana/web3.js';
import { env } from '@/config/env.config';
import { SOLANA_PROGRAM_IDS } from '@/config/solana.config';
import type { ProposalInstruction } from '@/features/proposal/proposal.model';
import { AppError } from '@/shared/errors/app-error';
import {
  prepareUnsignedTransaction,
  type PreparedTransactionEnvelope,
} from '@/shared/solana/prepared-transaction.util';
import { getEnvSigner } from '@/shared/solana/solana-signer.util';

type CreateOnchainProposalFromStoredInput = {
  governanceProgramId: string;
  programVersion: number;
  realmAddress: string;
  governanceAddress: string;
  governingTokenMint: string;
  proposalName: string;
  descriptionLink: string;
  holdUpSeconds: number;
  instructions: ProposalInstruction[];
  optionIndex?: number;
  useDenyOption?: boolean;
  rpcUrl?: string;
  signOff?: boolean;
};

type CreateOnchainProposalFromStoredResult = {
  proposalAddress: string;
  tokenOwnerRecordAddress: string;
  transactionAddresses: string[];
  signatures: string[];
};

type PrepareOnchainProposalFromStoredInput = {
  governanceProgramId: string;
  programVersion: number;
  realmAddress: string;
  governanceAddress: string;
  governingTokenMint: string;
  proposalName: string;
  descriptionLink: string;
  holdUpSeconds: number;
  instructions: ProposalInstruction[];
  authorityWallet: string;
  payerWallet?: string;
  optionIndex?: number;
  useDenyOption?: boolean;
  rpcUrl?: string;
  signOff?: boolean;
};

type PrepareOnchainProposalFromStoredResult = {
  proposalAddress: string;
  tokenOwnerRecordAddress: string;
  transactionAddresses: string[];
  preparedTransactions: PreparedTransactionEnvelope[];
};

const sendInstructionBatch = async (
  connection: Connection,
  instructions: TransactionInstruction[],
): Promise<string> => {
  const signer = getEnvSigner();

  const transaction = new Transaction().add(...instructions);
  transaction.feePayer = signer.publicKey;

  const latestBlockhash = await connection.getLatestBlockhash(env.SOLANA_COMMITMENT as Commitment);
  transaction.recentBlockhash = latestBlockhash.blockhash;

  return sendAndConfirmTransaction(connection, transaction, [signer], {
    commitment: env.SOLANA_COMMITMENT as Commitment,
    skipPreflight: false,
  });
};

const assertProposalCreatorHasEnoughGoverningTokens = async (input: {
  connection: Connection;
  governanceAddress: PublicKey;
  realmAddress: PublicKey;
  governingTokenMint: PublicKey;
  tokenOwnerRecordAddress: PublicKey;
  tokenOwnerRecordExists: boolean;
}): Promise<void> => {
  const [governance, realm] = await Promise.all([
    getGovernance(input.connection, input.governanceAddress),
    getRealm(input.connection, input.realmAddress),
  ]);

  const isCouncilMint = Boolean(
    realm.account.config.councilMint && realm.account.config.councilMint.equals(input.governingTokenMint),
  );
  const minTokensToCreateProposal = isCouncilMint
    ? governance.account.config.minCouncilTokensToCreateProposal
    : governance.account.config.minCommunityTokensToCreateProposal;
  const minimumRequired = BigInt(minTokensToCreateProposal.toString());

  if (minimumRequired === 0n) {
    return;
  }

  let depositedAmount = 0n;

  if (input.tokenOwnerRecordExists) {
    const tokenOwnerRecord = await getTokenOwnerRecord(input.connection, input.tokenOwnerRecordAddress);
    depositedAmount = BigInt(tokenOwnerRecord.account.governingTokenDepositAmount.toString());
  }

  if (depositedAmount >= minimumRequired) {
    return;
  }

  throw new AppError(
    `You need at least ${minimumRequired.toString()} deposited ${isCouncilMint ? 'council' : 'community'} governing tokens to create a proposal in this DAO. Current deposited amount: ${depositedAmount.toString()}. Deposit governing tokens first, then try again.`,
    400,
    'ONCHAIN_PROPOSAL_CREATOR_INSUFFICIENT_TOKENS',
  );
};

const parseStoredPayload = (instruction: ProposalInstruction): Record<string, unknown> => {
  if (!instruction.dataBase64) {
    return {};
  }

  try {
    return JSON.parse(Buffer.from(instruction.dataBase64, 'base64').toString('utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
};

const maxU64 = (1n << 64n) - 1n;

const toU64BaseUnits = (amount: string, decimals: number): bigint => {
  if (!/^\d+(\.\d+)?$/.test(amount.trim())) {
    throw new AppError('transfer-spl amount is invalid', 400, 'ONCHAIN_TRANSFER_SPL_INVALID_AMOUNT');
  }

  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new AppError('transfer-spl decimals are invalid', 400, 'ONCHAIN_TRANSFER_SPL_INVALID_DECIMALS');
  }

  const [wholePartRaw, fractionRaw = ''] = amount.trim().split('.');
  const wholePart = wholePartRaw === '' ? '0' : wholePartRaw;

  if (fractionRaw.length > decimals) {
    throw new AppError(
      'transfer-spl amount has more fractional digits than decimals',
      400,
      'ONCHAIN_TRANSFER_SPL_INVALID_PRECISION',
    );
  }

  const fractionPart = fractionRaw.padEnd(decimals, '0');
  const base = 10n ** BigInt(decimals);
  const units = BigInt(wholePart) * base + BigInt(fractionPart === '' ? '0' : fractionPart);

  if (units <= 0n || units > maxU64) {
    throw new AppError('transfer-spl amount is out of range', 400, 'ONCHAIN_TRANSFER_SPL_AMOUNT_OUT_OF_RANGE');
  }

  return units;
};

const encodeSplTransferInstructionData = (amountBaseUnits: bigint): Buffer => {
  const data = Buffer.alloc(9);
  data.writeUInt8(3, 0); // TokenInstruction::Transfer
  data.writeBigUInt64LE(amountBaseUnits, 1);
  return data;
};

const encodeUpgradeableLoaderUpgradeInstructionData = (): Buffer => {
  const data = Buffer.alloc(4);
  data.writeUInt32LE(3, 0); // UpgradeableLoaderInstruction::Upgrade
  return data;
};

type StoredAccountMeta = {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
};

const isStoredAccountMeta = (value: unknown): value is StoredAccountMeta => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<StoredAccountMeta>;

  return (
    typeof candidate.pubkey === 'string' &&
    typeof candidate.isSigner === 'boolean' &&
    typeof candidate.isWritable === 'boolean'
  );
};

const parseStoredAccountMetas = (value: unknown): StoredAccountMeta[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isStoredAccountMeta);
};

const toVoteThreshold = (percent: number): VoteThreshold =>
  new VoteThreshold({
    type: VoteThresholdType.YesVotePercentage,
    value: percent,
  });

const toRuntimeInstruction = async (
  instruction: ProposalInstruction,
  context: {
    connection: Connection;
    governanceProgramId: PublicKey;
    governanceAddress: PublicKey;
    programVersion: number;
    expectedNativeTreasuryAddress?: PublicKey;
  },
): Promise<TransactionInstruction> => {
  if (instruction.kind === 'transfer') {
    const payload = parseStoredPayload(instruction);

    if (payload.operation === 'transfer-sol') {
      const fromGovernance = payload.fromGovernance as string | undefined;
      const toWallet = payload.toWallet as string | undefined;
      const lamports = payload.lamports as number | undefined;

      if (!fromGovernance || !toWallet || !lamports) {
        throw new AppError('Transfer instruction payload is invalid for onchain creation', 400, 'ONCHAIN_TRANSFER_INVALID');
      }

      if (context.expectedNativeTreasuryAddress && fromGovernance !== context.expectedNativeTreasuryAddress.toBase58()) {
        throw new AppError(
          'transfer-sol source must match the governance native treasury PDA',
          400,
          'ONCHAIN_TRANSFER_SOURCE_MISMATCH',
          {
            expectedFrom: context.expectedNativeTreasuryAddress.toBase58(),
            receivedFrom: fromGovernance,
          },
        );
      }

      return SystemProgram.transfer({
        fromPubkey: new PublicKey(fromGovernance),
        toPubkey: new PublicKey(toWallet),
        lamports,
      });
    }

    if (payload.operation === 'transfer-spl') {
      const fromTokenAccount = payload.fromTokenAccount as string | undefined;
      const toTokenAccount = payload.toTokenAccount as string | undefined;
      const amount = payload.amount as string | undefined;
      const decimals = payload.decimals as number | undefined;

      if (!fromTokenAccount || !toTokenAccount || !amount || typeof decimals !== 'number') {
        throw new AppError('transfer-spl payload is invalid for onchain creation', 400, 'ONCHAIN_TRANSFER_SPL_INVALID');
      }

      if (!context.expectedNativeTreasuryAddress) {
        throw new AppError(
          'transfer-spl requires governance native treasury authority',
          400,
          'ONCHAIN_TRANSFER_SPL_MISSING_AUTHORITY',
        );
      }

      const amountBaseUnits = toU64BaseUnits(amount, decimals);

      return new TransactionInstruction({
        programId: new PublicKey(instruction.programId),
        keys: [
          { pubkey: new PublicKey(fromTokenAccount), isSigner: false, isWritable: true },
          { pubkey: new PublicKey(toTokenAccount), isSigner: false, isWritable: true },
          { pubkey: context.expectedNativeTreasuryAddress, isSigner: true, isWritable: false },
        ],
        data: encodeSplTransferInstructionData(amountBaseUnits),
      });
    }

    throw new AppError(
      'Only transfer-sol and transfer-spl instructions are supported for automatic onchain creation',
      400,
      'ONCHAIN_TRANSFER_UNSUPPORTED',
    );
  }

  if (instruction.kind === 'config') {
    const payload = parseStoredPayload(instruction);

    if (payload.operation !== 'set-governance-config') {
      throw new AppError(
        'Unsupported config operation for automatic onchain creation',
        400,
        'ONCHAIN_CONFIG_UNSUPPORTED',
      );
    }

    const governanceAddress = payload.governanceAddress as string | undefined;
    const yesVoteThresholdPercent = payload.yesVoteThresholdPercent as number | undefined;
    const baseVotingTimeSeconds = payload.baseVotingTimeSeconds as number | undefined;
    const minInstructionHoldUpTimeSeconds = payload.minInstructionHoldUpTimeSeconds as number | undefined;
    const communityVetoThresholdPercent = payload.communityVetoThresholdPercent as number | undefined;

    if (
      !governanceAddress ||
      !Number.isInteger(yesVoteThresholdPercent) ||
      !Number.isInteger(baseVotingTimeSeconds) ||
      !Number.isInteger(minInstructionHoldUpTimeSeconds)
    ) {
      throw new AppError('set-governance-config payload is invalid', 400, 'ONCHAIN_CONFIG_INVALID');
    }

    if (governanceAddress !== context.governanceAddress.toBase58()) {
      throw new AppError(
        'set-governance-config governance must match the proposal governance address',
        400,
        'ONCHAIN_CONFIG_GOVERNANCE_MISMATCH',
        {
          expectedGovernance: context.governanceAddress.toBase58(),
          receivedGovernance: governanceAddress,
        },
      );
    }

    const normalizedYesVoteThresholdPercent = yesVoteThresholdPercent as number;
    const normalizedBaseVotingTimeSeconds = baseVotingTimeSeconds as number;
    const normalizedMinInstructionHoldUpTimeSeconds = minInstructionHoldUpTimeSeconds as number;

    if (normalizedYesVoteThresholdPercent < 1 || normalizedYesVoteThresholdPercent > 100) {
      throw new AppError(
        'set-governance-config yesVoteThresholdPercent must be within 1..100',
        400,
        'ONCHAIN_CONFIG_THRESHOLD_INVALID',
      );
    }

    if (normalizedBaseVotingTimeSeconds < 3600) {
      throw new AppError(
        'set-governance-config baseVotingTimeSeconds must be at least 3600',
        400,
        'ONCHAIN_CONFIG_BASE_VOTING_TIME_INVALID',
      );
    }

    if (normalizedMinInstructionHoldUpTimeSeconds < 0) {
      throw new AppError(
        'set-governance-config minInstructionHoldUpTimeSeconds must be non-negative',
        400,
        'ONCHAIN_CONFIG_HOLDUP_INVALID',
      );
    }

    if (
      communityVetoThresholdPercent !== undefined &&
      (!Number.isInteger(communityVetoThresholdPercent) ||
        communityVetoThresholdPercent < 0 ||
        communityVetoThresholdPercent > 100)
    ) {
      throw new AppError(
        'set-governance-config communityVetoThresholdPercent must be within 0..100 when provided',
        400,
        'ONCHAIN_CONFIG_VETO_THRESHOLD_INVALID',
      );
    }

    const governance = await getGovernance(context.connection, context.governanceAddress);
    const currentConfig = governance.account.config;

    const nextCommunityVetoVoteThreshold =
      communityVetoThresholdPercent === undefined
        ? currentConfig.communityVetoVoteThreshold
        : communityVetoThresholdPercent === 0
          ? new VoteThreshold({ type: VoteThresholdType.Disabled })
          : toVoteThreshold(communityVetoThresholdPercent);

    const nextConfig = new GovernanceConfig({
      communityVoteThreshold: toVoteThreshold(normalizedYesVoteThresholdPercent),
      minCommunityTokensToCreateProposal: currentConfig.minCommunityTokensToCreateProposal,
      minInstructionHoldUpTime: normalizedMinInstructionHoldUpTimeSeconds,
      baseVotingTime: normalizedBaseVotingTimeSeconds,
      communityVoteTipping: currentConfig.communityVoteTipping,
      minCouncilTokensToCreateProposal: currentConfig.minCouncilTokensToCreateProposal,
      councilVoteThreshold: currentConfig.councilVoteThreshold,
      councilVetoVoteThreshold: currentConfig.councilVetoVoteThreshold,
      communityVetoVoteThreshold: nextCommunityVetoVoteThreshold,
      councilVoteTipping: currentConfig.councilVoteTipping,
      votingCoolOffTime: currentConfig.votingCoolOffTime,
      depositExemptProposalCount: currentConfig.depositExemptProposalCount,
    });

    return createSetGovernanceConfig(
      context.governanceProgramId,
      context.programVersion,
      context.governanceAddress,
      nextConfig,
    );
  }

  if (instruction.kind === 'program-upgrade') {
    const payload = parseStoredPayload(instruction);

    if (payload.operation !== 'program-upgrade') {
      throw new AppError(
        'Unsupported program-upgrade operation for automatic onchain creation',
        400,
        'ONCHAIN_PROGRAM_UPGRADE_UNSUPPORTED',
      );
    }

    const programId = payload.programId as string | undefined;
    const bufferAddress = payload.bufferAddress as string | undefined;
    const spillAddress = payload.spillAddress as string | undefined;

    if (!programId || !bufferAddress || !spillAddress) {
      throw new AppError('program-upgrade payload is invalid', 400, 'ONCHAIN_PROGRAM_UPGRADE_INVALID');
    }

    if (!context.expectedNativeTreasuryAddress) {
      throw new AppError(
        'program-upgrade requires governance native treasury authority',
        400,
        'ONCHAIN_PROGRAM_UPGRADE_MISSING_AUTHORITY',
      );
    }

    const governedProgramAddress = new PublicKey(programId);
    const governedProgramDataAddress = await getProgramDataAddress(governedProgramAddress);

    return new TransactionInstruction({
      programId: new PublicKey(SOLANA_PROGRAM_IDS.bpfLoaderUpgradeable),
      keys: [
        { pubkey: governedProgramDataAddress, isSigner: false, isWritable: true },
        { pubkey: governedProgramAddress, isSigner: false, isWritable: true },
        { pubkey: new PublicKey(bufferAddress), isSigner: false, isWritable: true },
        { pubkey: new PublicKey(spillAddress), isSigner: false, isWritable: true },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: context.expectedNativeTreasuryAddress, isSigner: true, isWritable: false },
      ],
      data: encodeUpgradeableLoaderUpgradeInstructionData(),
    });
  }

  if (instruction.kind === 'stream') {
    const payload = parseStoredPayload(instruction);
    const payloadAccountMetas = parseStoredAccountMetas(payload.accountMetas);
    const streamDataBase64 = payload.instructionDataBase64 as string | undefined;

    if (payload.operation === 'create-stream' && streamDataBase64 && payloadAccountMetas.length > 0) {
      return new TransactionInstruction({
        programId: new PublicKey(instruction.programId),
        keys: payloadAccountMetas.map((meta) => ({
          pubkey: new PublicKey(meta.pubkey),
          isSigner: meta.isSigner,
          isWritable: meta.isWritable,
        })),
        data: Buffer.from(streamDataBase64, 'base64'),
      });
    }

    if (
      payload.operation === undefined &&
      instruction.dataBase64 &&
      instruction.accountMetas &&
      instruction.accountMetas.length > 0
    ) {
      return new TransactionInstruction({
        programId: new PublicKey(instruction.programId),
        keys: instruction.accountMetas.map((meta) => ({
          pubkey: new PublicKey(meta.pubkey),
          isSigner: meta.isSigner,
          isWritable: meta.isWritable,
        })),
        data: Buffer.from(instruction.dataBase64, 'base64'),
      });
    }

    throw new AppError(
      'create-stream requires compiled instructionDataBase64 and accountMetas for automatic onchain creation',
      400,
      'ONCHAIN_STREAM_DATA_MISSING',
    );
  }

  if (instruction.kind === 'custom') {
    if (instruction.dataBase64 === null || instruction.dataBase64 === undefined) {
      throw new AppError('Custom instruction dataBase64 is required for onchain creation', 400, 'ONCHAIN_CUSTOM_DATA_MISSING');
    }

    if (!instruction.accountMetas || instruction.accountMetas.length === 0) {
      throw new AppError(
        'Custom instruction accountMetas are required for onchain creation',
        400,
        'ONCHAIN_CUSTOM_ACCOUNTS_MISSING',
      );
    }

    return new TransactionInstruction({
      programId: new PublicKey(instruction.programId),
      keys: instruction.accountMetas.map((meta) => ({
        pubkey: new PublicKey(meta.pubkey),
        isSigner: meta.isSigner,
        isWritable: meta.isWritable,
      })),
      data: Buffer.from(instruction.dataBase64, 'base64'),
    });
  }

  throw new AppError(
    `Instruction kind ${instruction.kind} is not supported for automatic onchain creation`,
    400,
    'ONCHAIN_INSTRUCTION_KIND_UNSUPPORTED',
  );
};

export const createOnchainProposalFromStoredInstructions = async (
  input: CreateOnchainProposalFromStoredInput,
): Promise<CreateOnchainProposalFromStoredResult> => {
  const signer = getEnvSigner();
  const connection = new Connection(input.rpcUrl ?? env.SOLANA_RPC_URL, {
    commitment: env.SOLANA_COMMITMENT as Commitment,
  });

  const governanceProgramId = new PublicKey(input.governanceProgramId);
  const realmAddress = new PublicKey(input.realmAddress);
  const governanceAddress = new PublicKey(input.governanceAddress);
  const governingTokenMint = new PublicKey(input.governingTokenMint);
  const optionIndex = input.optionIndex ?? 0;
  const useDenyOption = input.useDenyOption ?? true;
  const nativeTreasuryAddress = await getNativeTreasuryAddress(governanceProgramId, governanceAddress);

  const signatures: string[] = [];

  const tokenOwnerRecordAddress = await getTokenOwnerRecordAddress(
    governanceProgramId,
    realmAddress,
    governingTokenMint,
    signer.publicKey,
  );

  const tokenOwnerRecordInfo = await connection.getAccountInfo(tokenOwnerRecordAddress, env.SOLANA_COMMITMENT as Commitment);
  const tokenOwnerRecordExists = Boolean(tokenOwnerRecordInfo);

  await assertProposalCreatorHasEnoughGoverningTokens({
    connection,
    governanceAddress,
    realmAddress,
    governingTokenMint,
    tokenOwnerRecordAddress,
    tokenOwnerRecordExists,
  });

  if (!tokenOwnerRecordExists) {
    const createTorInstructions: TransactionInstruction[] = [];

    await withCreateTokenOwnerRecord(
      createTorInstructions,
      governanceProgramId,
      input.programVersion,
      realmAddress,
      signer.publicKey,
      governingTokenMint,
      signer.publicKey,
    );

    const signature = await sendInstructionBatch(connection, createTorInstructions);
    signatures.push(signature);
  }

  const createProposalInstructions: TransactionInstruction[] = [];

  const proposalAddress = await withCreateProposal(
    createProposalInstructions,
    governanceProgramId,
    input.programVersion,
    realmAddress,
    governanceAddress,
    tokenOwnerRecordAddress,
    input.proposalName,
    input.descriptionLink,
    governingTokenMint,
    signer.publicKey,
    undefined,
    VoteType.SINGLE_CHOICE,
    ['Approve'],
    useDenyOption,
    signer.publicKey,
    undefined,
    undefined,
  );

  signatures.push(await sendInstructionBatch(connection, createProposalInstructions));

  const transactionAddresses: string[] = [];

  for (let index = 0; index < input.instructions.length; index += 1) {
    const instruction = input.instructions[index];
    const runtimeInstruction = await toRuntimeInstruction(instruction, {
      connection,
      governanceProgramId,
      governanceAddress,
      programVersion: input.programVersion,
      expectedNativeTreasuryAddress: nativeTreasuryAddress,
    });
    const governanceInstructionData = createInstructionData(runtimeInstruction);

    const insertInstructions: TransactionInstruction[] = [];

    const proposalTransactionAddress = await withInsertTransaction(
      insertInstructions,
      governanceProgramId,
      input.programVersion,
      governanceAddress,
      proposalAddress,
      tokenOwnerRecordAddress,
      signer.publicKey,
      index,
      optionIndex,
      input.holdUpSeconds,
      [governanceInstructionData],
      signer.publicKey,
    );

    signatures.push(await sendInstructionBatch(connection, insertInstructions));
    transactionAddresses.push(proposalTransactionAddress.toBase58());
  }

  if (input.signOff ?? true) {
    const signOffInstructions: TransactionInstruction[] = [];

    withSignOffProposal(
      signOffInstructions,
      governanceProgramId,
      input.programVersion,
      realmAddress,
      governanceAddress,
      proposalAddress,
      signer.publicKey,
      undefined,
      tokenOwnerRecordAddress,
    );

    signatures.push(await sendInstructionBatch(connection, signOffInstructions));
  }

  return {
    proposalAddress: proposalAddress.toBase58(),
    tokenOwnerRecordAddress: tokenOwnerRecordAddress.toBase58(),
    transactionAddresses,
    signatures,
  };
};

export const prepareOnchainProposalFromStoredInstructions = async (
  input: PrepareOnchainProposalFromStoredInput,
): Promise<PrepareOnchainProposalFromStoredResult> => {
  const connection = new Connection(input.rpcUrl ?? env.SOLANA_RPC_URL, {
    commitment: env.SOLANA_COMMITMENT as Commitment,
  });

  const governanceProgramId = new PublicKey(input.governanceProgramId);
  const realmAddress = new PublicKey(input.realmAddress);
  const governanceAddress = new PublicKey(input.governanceAddress);
  const governingTokenMint = new PublicKey(input.governingTokenMint);
  const authorityWallet = new PublicKey(input.authorityWallet);
  const payerWallet = input.payerWallet ? new PublicKey(input.payerWallet) : authorityWallet;
  const optionIndex = input.optionIndex ?? 0;
  const useDenyOption = input.useDenyOption ?? true;
  const nativeTreasuryAddress = await getNativeTreasuryAddress(governanceProgramId, governanceAddress);

  const preparedTransactions: PreparedTransactionEnvelope[] = [];
  const transactionAddresses: string[] = [];

  const tokenOwnerRecordAddress = await getTokenOwnerRecordAddress(
    governanceProgramId,
    realmAddress,
    governingTokenMint,
    authorityWallet,
  );

  const tokenOwnerRecordInfo = await connection.getAccountInfo(tokenOwnerRecordAddress, env.SOLANA_COMMITMENT as Commitment);
  const tokenOwnerRecordExists = Boolean(tokenOwnerRecordInfo);

  await assertProposalCreatorHasEnoughGoverningTokens({
    connection,
    governanceAddress,
    realmAddress,
    governingTokenMint,
    tokenOwnerRecordAddress,
    tokenOwnerRecordExists,
  });

  if (!tokenOwnerRecordExists) {
    const createTorInstructions: TransactionInstruction[] = [];

    await withCreateTokenOwnerRecord(
      createTorInstructions,
      governanceProgramId,
      input.programVersion,
      realmAddress,
      authorityWallet,
      governingTokenMint,
      payerWallet,
    );

    preparedTransactions.push(
      await prepareUnsignedTransaction({
        connection,
        instructions: createTorInstructions,
        feePayer: payerWallet,
        label: 'create-token-owner-record',
      }),
    );
  }

  const createProposalInstructions: TransactionInstruction[] = [];

  const proposalAddress = await withCreateProposal(
    createProposalInstructions,
    governanceProgramId,
    input.programVersion,
    realmAddress,
    governanceAddress,
    tokenOwnerRecordAddress,
    input.proposalName,
    input.descriptionLink,
    governingTokenMint,
    authorityWallet,
    undefined,
    VoteType.SINGLE_CHOICE,
    ['Approve'],
    useDenyOption,
    payerWallet,
    undefined,
    undefined,
  );

  preparedTransactions.push(
    await prepareUnsignedTransaction({
      connection,
      instructions: createProposalInstructions,
      feePayer: payerWallet,
      label: 'create-proposal',
    }),
  );

  for (let index = 0; index < input.instructions.length; index += 1) {
    const instruction = input.instructions[index];
    const runtimeInstruction = await toRuntimeInstruction(instruction, {
      connection,
      governanceProgramId,
      governanceAddress,
      programVersion: input.programVersion,
      expectedNativeTreasuryAddress: nativeTreasuryAddress,
    });
    const governanceInstructionData = createInstructionData(runtimeInstruction);

    const insertInstructions: TransactionInstruction[] = [];

    const proposalTransactionAddress = await withInsertTransaction(
      insertInstructions,
      governanceProgramId,
      input.programVersion,
      governanceAddress,
      proposalAddress,
      tokenOwnerRecordAddress,
      authorityWallet,
      index,
      optionIndex,
      input.holdUpSeconds,
      [governanceInstructionData],
      payerWallet,
    );

    preparedTransactions.push(
      await prepareUnsignedTransaction({
        connection,
        instructions: insertInstructions,
        feePayer: payerWallet,
        label: `insert-transaction-${index}`,
      }),
    );
    transactionAddresses.push(proposalTransactionAddress.toBase58());
  }

  if (input.signOff ?? true) {
    const signOffInstructions: TransactionInstruction[] = [];

    withSignOffProposal(
      signOffInstructions,
      governanceProgramId,
      input.programVersion,
      realmAddress,
      governanceAddress,
      proposalAddress,
      authorityWallet,
      undefined,
      tokenOwnerRecordAddress,
    );

    preparedTransactions.push(
      await prepareUnsignedTransaction({
        connection,
        instructions: signOffInstructions,
        feePayer: payerWallet,
        label: 'sign-off-proposal',
      }),
    );
  }

  return {
    proposalAddress: proposalAddress.toBase58(),
    tokenOwnerRecordAddress: tokenOwnerRecordAddress.toBase58(),
    transactionAddresses,
    preparedTransactions,
  };
};
