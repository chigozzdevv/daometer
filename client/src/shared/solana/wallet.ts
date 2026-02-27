import { Transaction, VersionedTransaction } from '@solana/web3.js';

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
  request?: (request: { method: string; params?: unknown }) => Promise<unknown>;
};

const base64ToBytes = (value: string): Uint8Array => {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
};

const bytesToBase64 = (value: Uint8Array): string => {
  let binary = '';

  value.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return window.btoa(binary);
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

const deserializePreparedTransaction = (transactionBase64: string): Transaction | VersionedTransaction => {
  const transactionBytes = base64ToBytes(transactionBase64);

  try {
    return Transaction.from(transactionBytes);
  } catch {
    return VersionedTransaction.deserialize(transactionBytes);
  }
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
): Promise<string> => {
  const errors: string[] = [];
  const isPhantomProvider =
    typeof window !== 'undefined' &&
    ((window as unknown as { phantom?: { solana?: SolanaProvider } }).phantom?.solana === provider);
  const preparedTransaction = deserializePreparedTransaction(transactionBase64);

  if (typeof provider.signAndSendTransaction === 'function') {
    const directVariants: Array<{ label: string; payload: unknown; options?: Record<string, unknown> }> = [
      {
        label: 'signAndSend(transaction-object)',
        payload: preparedTransaction,
        options: {
          preflightCommitment: 'confirmed',
        },
      },
      {
        label: 'signAndSend(transaction-object-no-options)',
        payload: preparedTransaction,
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
        const result = await provider.signAndSendTransaction(variant.payload, variant.options);
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

  if (typeof provider.request === 'function' && !isPhantomProvider) {
    const requestVariants: Array<{ label: string; params: unknown }> = [
      { label: 'request(transaction-base58-string)', params: transactionBase58 },
      { label: 'request([transaction-base58-string])', params: [transactionBase58] },
      {
        label: 'request(transaction-base58-object)',
        params: {
          transaction: transactionBase58,
          options: {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
          },
        },
      },
      {
        label: 'request(message-object)',
        params: {
          message: transactionMessage,
          options: {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
          },
        },
      },
      {
        label: 'request(transaction-base64-object)',
        params: {
          transaction: transactionBase64,
          encoding: 'base64',
          options: {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
          },
        },
      },
    ];

    for (const variant of requestVariants) {
      try {
        const result = await provider.request({
          method: 'signAndSendTransaction',
          params: variant.params,
        });
        const signature = extractSignature(result);

        if (signature) {
          return signature;
        }
      } catch (error) {
        errors.push(
          `${variant.label}: ${error instanceof Error ? error.message : 'unknown provider.request error'}`,
        );
      }
    }
  }

  const details = errors.length > 0 ? ` Attempts: ${errors.slice(0, 3).join(' | ')}` : '';
  throw new Error(`Wallet could not sign and send the prepared transaction.${details}`);
};
