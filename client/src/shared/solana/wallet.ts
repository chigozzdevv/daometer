import { Buffer } from 'buffer';
import bs58 from 'bs58';
import { Connection, Transaction, VersionedTransaction } from '@solana/web3.js';

export type SolanaProviderConnectResult = {
  publicKey?: {
    toBase58: () => string;
  };
};

export type SolanaProvider = {
  publicKey?: {
    toBase58: () => string;
  };
  connect: (options?: { onlyIfTrusted?: boolean }) => Promise<SolanaProviderConnectResult>;
  signAndSendTransaction?: (
    transaction: Uint8Array | unknown,
    options?: Record<string, unknown>,
  ) => Promise<unknown>;
  signTransaction?: (transaction: Transaction | VersionedTransaction) => Promise<unknown>;
  request?: (request: { method: string; params?: unknown }) => Promise<unknown>;
};

const base64ToBytes = (value: string): Uint8Array => {
  return new Uint8Array(Buffer.from(value, 'base64'));
};

const bytesToBase64 = (value: Uint8Array): string => {
  return Buffer.from(value).toString('base64');
};

const decodeSerializedTransaction = (value: string): Uint8Array | null => {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  try {
    return bs58.decode(trimmed);
  } catch {
    try {
      return base64ToBytes(trimmed);
    } catch {
      return null;
    }
  }
};

export const getSolanaProvider = (): SolanaProvider | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const walletWindow = window as unknown as {
    solana?: SolanaProvider;
    phantom?: {
      solana?: SolanaProvider;
    };
  };
  const candidate = walletWindow.phantom?.solana ?? walletWindow.solana;

  if (!candidate || typeof candidate.connect !== 'function') {
    return null;
  }

  return candidate;
};

const getProviderCandidates = (provider: SolanaProvider): SolanaProvider[] => {
  if (typeof window === 'undefined') {
    return [provider];
  }

  const walletWindow = window as unknown as {
    solana?: SolanaProvider;
    phantom?: {
      solana?: SolanaProvider;
    };
  };

  return [provider, walletWindow.solana, walletWindow.phantom?.solana].filter(
    (candidate, index, array): candidate is SolanaProvider =>
      Boolean(candidate) && array.findIndex((entry) => entry === candidate) === index,
  );
};

const getSignAndSendTransactionMethod = (
  provider: SolanaProvider,
): NonNullable<SolanaProvider['signAndSendTransaction']> | null => {
  const candidate = getProviderCandidates(provider).find(
    (entry) => typeof entry.signAndSendTransaction === 'function',
  );

  if (!candidate) {
    return null;
  }

  const method = candidate.signAndSendTransaction;
  return typeof method === 'function' ? method.bind(candidate) : null;
};

const getSignTransactionMethod = (
  provider: SolanaProvider,
): NonNullable<SolanaProvider['signTransaction']> | null => {
  const candidate = getProviderCandidates(provider).find(
    (entry) => typeof entry.signTransaction === 'function',
  );

  if (!candidate) {
    return null;
  }

  const method = candidate.signTransaction;
  return typeof method === 'function' ? method.bind(candidate) : null;
};

const deserializePreparedTransaction = (transactionBase64: string): Transaction | VersionedTransaction => {
  const transactionBytes = base64ToBytes(transactionBase64);

  try {
    return Transaction.from(transactionBytes);
  } catch {
    return VersionedTransaction.deserialize(transactionBytes);
  }
};

const serializeSignedTransaction = (
  signedTransaction: unknown,
  fallback: Transaction | VersionedTransaction,
): Uint8Array => {
  if (signedTransaction instanceof Transaction) {
    return signedTransaction.serialize();
  }

  if (signedTransaction instanceof VersionedTransaction) {
    return signedTransaction.serialize();
  }

  if (signedTransaction instanceof Uint8Array) {
    return signedTransaction;
  }

  if (typeof signedTransaction === 'string') {
    const decoded = decodeSerializedTransaction(signedTransaction);

    if (decoded) {
      return decoded;
    }
  }

  if (signedTransaction && typeof signedTransaction === 'object') {
    const maybeSignedTransaction = (signedTransaction as { transaction?: unknown }).transaction;

    if (typeof maybeSignedTransaction === 'string') {
      const decoded = decodeSerializedTransaction(maybeSignedTransaction);

      if (decoded) {
        return decoded;
      }
    }

    const maybeSerialize = (signedTransaction as { serialize?: () => Uint8Array | ArrayLike<number> }).serialize;

    if (typeof maybeSerialize === 'function') {
      const serialized = maybeSerialize.call(signedTransaction);
      return serialized instanceof Uint8Array ? serialized : new Uint8Array(serialized);
    }
  }

  if (fallback instanceof Transaction) {
    return fallback.serialize();
  }

  return fallback.serialize();
};

type SendPreparedTransactionOptions = {
  rpcUrl?: string;
  recentBlockhash?: string;
  lastValidBlockHeight?: number;
};

const extractSignature = (result: unknown): string | null => {
  if (typeof result === 'string' && result.trim().length > 0) {
    return result;
  }

  if (result && typeof result === 'object') {
    const maybeSignature = (result as { signature?: unknown }).signature;

    if (typeof maybeSignature === 'string' && maybeSignature.trim().length > 0) {
      return maybeSignature;
    }

    if (maybeSignature instanceof Uint8Array) {
      return bytesToBase64(maybeSignature);
    }
  }

  return null;
};

export const sendPreparedTransaction = async (
  provider: SolanaProvider,
  transactionMessage: string,
  transactionBase58: string,
  transactionBase64: string,
  options: SendPreparedTransactionOptions = {},
): Promise<string> => {
  const errors: string[] = [];
  const isPhantomProvider =
    typeof window !== 'undefined' &&
    ((window as unknown as { phantom?: { solana?: SolanaProvider } }).phantom?.solana === provider);
  const buildPreparedTransaction = (): Transaction | VersionedTransaction =>
    deserializePreparedTransaction(transactionBase64);
  const signAndSendTransaction = getSignAndSendTransactionMethod(provider);
  const signTransaction = getSignTransactionMethod(provider);

  if (signAndSendTransaction) {
    const directVariants: Array<{ label: string; payload: unknown; options?: Record<string, unknown> }> = [
      {
        label: 'signAndSend(transaction-object)',
        payload: buildPreparedTransaction(),
        options: {
          preflightCommitment: 'confirmed',
        },
      },
      {
        label: 'signAndSend(transaction-object-no-options)',
        payload: buildPreparedTransaction(),
      },
    ];

    if (!isPhantomProvider) {
      directVariants.push(
        {
          label: 'signAndSend(bytes)',
          payload: base64ToBytes(transactionBase64),
          options: {
            preflightCommitment: 'confirmed',
          },
        },
        { label: 'signAndSend(base58-string)', payload: transactionBase58 },
        { label: 'signAndSend(base64-string)', payload: transactionBase64 },
        { label: 'signAndSend(message-object)', payload: { message: transactionMessage } },
      );
    }

    for (const variant of directVariants) {
      try {
        const result = await signAndSendTransaction(variant.payload, variant.options);
        const signature = extractSignature(result);

        if (signature) {
          return signature;
        }
      } catch (error) {
        errors.push(
          `${variant.label}: ${error instanceof Error ? error.message : 'unknown signAndSendTransaction error'}`,
        );
      }
    }
  }

  if (signTransaction && options.rpcUrl) {
    try {
      const transactionForSigning = buildPreparedTransaction();
      const signedTransaction = await signTransaction(transactionForSigning);
      const serialized = serializeSignedTransaction(signedTransaction, transactionForSigning);
      const connection = new Connection(options.rpcUrl, 'confirmed');
      const signature = await connection.sendRawTransaction(serialized, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      if (options.recentBlockhash && typeof options.lastValidBlockHeight === 'number') {
        await connection.confirmTransaction(
          {
            signature,
            blockhash: options.recentBlockhash,
            lastValidBlockHeight: options.lastValidBlockHeight,
          },
          'confirmed',
        );
      }

      return signature;
    } catch (error) {
      errors.push(
        `signTransaction+sendRawTransaction: ${error instanceof Error ? error.message : 'unknown signTransaction error'}`,
      );
    }
  } else if (!signTransaction) {
    errors.push('signTransaction+sendRawTransaction: signTransaction unavailable on injected wallet provider');
  }

  if (typeof provider.request === 'function' && options.rpcUrl) {
    try {
      const transactionForSigning = buildPreparedTransaction();
      const signedTransaction = await provider.request({
        method: 'signTransaction',
        params: {
          message: transactionMessage,
        },
      });
      const serialized = serializeSignedTransaction(signedTransaction, transactionForSigning);
      const connection = new Connection(options.rpcUrl, 'confirmed');
      const signature = await connection.sendRawTransaction(serialized, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      if (options.recentBlockhash && typeof options.lastValidBlockHeight === 'number') {
        await connection.confirmTransaction(
          {
            signature,
            blockhash: options.recentBlockhash,
            lastValidBlockHeight: options.lastValidBlockHeight,
          },
          'confirmed',
        );
      }

      return signature;
    } catch (error) {
      errors.push(
        `request(signTransaction-message): ${error instanceof Error ? error.message : 'unknown provider.request signTransaction error'}`,
      );
    }
  }

  const details = errors.length > 0 ? ` Attempts: ${errors.join(' | ')}` : '';
  throw new Error(`Wallet could not sign and send the prepared transaction.${details}`);
};
