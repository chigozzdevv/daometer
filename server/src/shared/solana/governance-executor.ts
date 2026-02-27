import {
  getGovernanceAccount,
  InstructionExecutionStatus,
  ProposalTransaction,
  withExecuteTransaction,
} from '@realms-today/spl-governance';
import {
  Connection,
  PublicKey,
  sendAndConfirmTransaction,
  Transaction,
  TransactionInstruction,
  type Commitment,
  type SimulatedTransactionResponse,
} from '@solana/web3.js';
import { env } from '@/config/env.config';
import { AppError } from '@/shared/errors/app-error';
import {
  prepareUnsignedTransaction,
  type PreparedTransactionEnvelope,
} from '@/shared/solana/prepared-transaction.util';
import { getEnvSigner } from '@/shared/solana/solana-signer.util';

type ExecuteGovernanceProposalInput = {
  governanceProgramId: string;
  programVersion: number;
  governanceAddress: string;
  proposalAddress: string;
  transactionAddresses: string[];
  rpcUrl?: string | null;
  requireSimulation?: boolean;
  onBeforeTransaction?: () => Promise<void>;
};

type ExecuteGovernanceProposalResult = {
  signatures: string[];
  skippedTransactionAddresses: string[];
};

type PrepareGovernanceProposalExecutionInput = {
  governanceProgramId: string;
  programVersion: number;
  governanceAddress: string;
  proposalAddress: string;
  transactionAddresses: string[];
  feePayerWallet: string;
  rpcUrl?: string | null;
};

type PrepareGovernanceProposalExecutionResult = {
  preparedTransactions: PreparedTransactionEnvelope[];
  skippedTransactionAddresses: string[];
};

const assertSimulationResult = (result: SimulatedTransactionResponse | null): void => {
  if (!result) {
    throw new AppError('Simulation returned empty result', 400, 'SIMULATION_EMPTY_RESULT');
  }

  if (result.err) {
    throw new AppError('Simulation failed', 400, 'SIMULATION_FAILED', {
      error: result.err,
      logs: result.logs,
    });
  }
};

export const executeGovernanceProposalTransactions = async (
  input: ExecuteGovernanceProposalInput,
): Promise<ExecuteGovernanceProposalResult> => {
  if (input.transactionAddresses.length === 0) {
    throw new AppError('No transaction addresses configured for onchain execution', 400, 'ONCHAIN_TX_MISSING');
  }

  const connection = new Connection(input.rpcUrl ?? env.SOLANA_RPC_URL, {
    commitment: env.SOLANA_COMMITMENT as Commitment,
  });

  const signer = getEnvSigner();
  const governanceProgramId = new PublicKey(input.governanceProgramId);
  const governanceAddress = new PublicKey(input.governanceAddress);
  const proposalAddress = new PublicKey(input.proposalAddress);
  const shouldSimulate = input.requireSimulation ?? env.WORKER_SIMULATE_BEFORE_EXECUTE;

  const signatures: string[] = [];
  const skippedTransactionAddresses: string[] = [];

  for (const transactionAddressText of input.transactionAddresses) {
    if (input.onBeforeTransaction) {
      await input.onBeforeTransaction();
    }

    const transactionAddress = new PublicKey(transactionAddressText);

    const proposalTransactionAccount = await getGovernanceAccount(
      connection,
      transactionAddress,
      ProposalTransaction,
    );

    if (proposalTransactionAccount.account.executionStatus === InstructionExecutionStatus.Success) {
      skippedTransactionAddresses.push(transactionAddressText);
      continue;
    }

    const governanceInstructions = proposalTransactionAccount.account.getAllInstructions();

    const executeInstructions: TransactionInstruction[] = [];

    await withExecuteTransaction(
      executeInstructions,
      governanceProgramId,
      input.programVersion,
      governanceAddress,
      proposalAddress,
      transactionAddress,
      governanceInstructions,
    );

    const transaction = new Transaction().add(...executeInstructions);
    transaction.feePayer = signer.publicKey;

    const latestBlockhash = await connection.getLatestBlockhash(env.SOLANA_COMMITMENT as Commitment);
    transaction.recentBlockhash = latestBlockhash.blockhash;

    if (shouldSimulate) {
      const simulation = await connection.simulateTransaction(transaction, [signer], true);
      assertSimulationResult(simulation.value);
    }

    const signature = await sendAndConfirmTransaction(connection, transaction, [signer], {
      commitment: env.SOLANA_COMMITMENT as Commitment,
      skipPreflight: false,
    });

    signatures.push(signature);
  }

  return {
    signatures,
    skippedTransactionAddresses,
  };
};

export const prepareGovernanceProposalExecutionTransactions = async (
  input: PrepareGovernanceProposalExecutionInput,
): Promise<PrepareGovernanceProposalExecutionResult> => {
  if (input.transactionAddresses.length === 0) {
    throw new AppError('No transaction addresses configured for onchain execution', 400, 'ONCHAIN_TX_MISSING');
  }

  const connection = new Connection(input.rpcUrl ?? env.SOLANA_RPC_URL, {
    commitment: env.SOLANA_COMMITMENT as Commitment,
  });
  const governanceProgramId = new PublicKey(input.governanceProgramId);
  const governanceAddress = new PublicKey(input.governanceAddress);
  const proposalAddress = new PublicKey(input.proposalAddress);
  const feePayer = new PublicKey(input.feePayerWallet);

  const preparedTransactions: PreparedTransactionEnvelope[] = [];
  const skippedTransactionAddresses: string[] = [];

  for (const transactionAddressText of input.transactionAddresses) {
    const transactionAddress = new PublicKey(transactionAddressText);

    const proposalTransactionAccount = await getGovernanceAccount(
      connection,
      transactionAddress,
      ProposalTransaction,
    );

    if (proposalTransactionAccount.account.executionStatus === InstructionExecutionStatus.Success) {
      skippedTransactionAddresses.push(transactionAddressText);
      continue;
    }

    const governanceInstructions = proposalTransactionAccount.account.getAllInstructions();
    const executeInstructions: TransactionInstruction[] = [];

    await withExecuteTransaction(
      executeInstructions,
      governanceProgramId,
      input.programVersion,
      governanceAddress,
      proposalAddress,
      transactionAddress,
      governanceInstructions,
    );

    preparedTransactions.push(
      await prepareUnsignedTransaction({
        connection,
        instructions: executeInstructions,
        feePayer,
        label: `execute-${transactionAddress.toBase58().slice(0, 8)}`,
      }),
    );
  }

  return {
    preparedTransactions,
    skippedTransactionAddresses,
  };
};
