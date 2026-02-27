import { useState } from 'react';
import {
  createWalletChallengeRequest,
  verifyWalletChallengeRequest,
} from '@/features/auth/api/api';
import { useAuth } from '@/app/providers/auth-provider';

type AuthCardProps = {
  onAuthenticated: () => void;
};

type SolanaProviderConnectResult = {
  publicKey?: {
    toBase58: () => string;
  };
};

type SolanaProvider = {
  isPhantom?: boolean;
  publicKey?: {
    toBase58: () => string;
  };
  connect: (options?: { onlyIfTrusted?: boolean }) => Promise<SolanaProviderConnectResult>;
  signMessage: (message: Uint8Array, display?: 'utf8' | 'hex') => Promise<{ signature: Uint8Array }>;
};

const toBase64 = (value: Uint8Array): string => {
  let binary = '';

  value.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return window.btoa(binary);
};

const getSolanaProvider = (): SolanaProvider | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const candidate = (window as unknown as { solana?: SolanaProvider }).solana;

  if (!candidate || typeof candidate.connect !== 'function' || typeof candidate.signMessage !== 'function') {
    return null;
  }

  return candidate;
};

export const AuthCard = ({ onAuthenticated }: AuthCardProps): JSX.Element => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { signIn } = useAuth();

  const handleConnectWallet = async (): Promise<void> => {
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const provider = getSolanaProvider();

      if (!provider) {
        throw new Error('No Solana wallet detected. Install Phantom or another wallet extension.');
      }

      const connectResult = await provider.connect();
      const walletAddress = connectResult.publicKey?.toBase58() ?? provider.publicKey?.toBase58();

      if (!walletAddress) {
        throw new Error('Wallet connection failed. Try reconnecting your wallet.');
      }

      const challenge = await createWalletChallengeRequest(walletAddress);
      const encodedMessage = new TextEncoder().encode(challenge.message);
      const signed = await provider.signMessage(encodedMessage, 'utf8');

      const response = await verifyWalletChallengeRequest({
        walletAddress: challenge.walletAddress,
        signatureBase64: toBase64(signed.signature),
      });

      signIn({
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
      });
      onAuthenticated();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to authenticate with wallet');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <article className="auth-card">
      <h1>Connect wallet</h1>
      <p>Authenticate with a Solana wallet signature to access your DAO automation workspace.</p>

      {errorMessage ? <p className="error-text">{errorMessage}</p> : null}

      <button type="button" className="primary-button" disabled={isSubmitting} onClick={handleConnectWallet}>
        {isSubmitting ? 'Connecting...' : 'Connect Wallet'}
      </button>
    </article>
  );
};
