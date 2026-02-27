import bs58 from 'bs58';
import { Transaction, TransactionInstruction, type Commitment, type Connection, type PublicKey } from '@solana/web3.js';
import { env } from '@/config/env.config';

export type PreparedTransactionEnvelope = {
  label: string;
  transactionMessage: string;
  transactionBase58: string;
  transactionBase64: string;
  recentBlockhash: string;
  lastValidBlockHeight: number;
};

type PrepareUnsignedTransactionInput = {
  connection: Connection;
  instructions: TransactionInstruction[];
  feePayer: PublicKey;
  label: string;
  commitment?: Commitment;
};

export const prepareUnsignedTransaction = async (
  input: PrepareUnsignedTransactionInput,
): Promise<PreparedTransactionEnvelope> => {
  const transaction = new Transaction().add(...input.instructions);
  transaction.feePayer = input.feePayer;

  const latestBlockhash = await input.connection.getLatestBlockhash(
    input.commitment ?? (env.SOLANA_COMMITMENT as Commitment),
  );
  transaction.recentBlockhash = latestBlockhash.blockhash;

  const serializedTransaction = transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });

  return {
    label: input.label,
    transactionMessage: bs58.encode(transaction.serializeMessage()),
    transactionBase58: bs58.encode(serializedTransaction),
    transactionBase64: Buffer.from(serializedTransaction).toString('base64'),
    recentBlockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  };
};
