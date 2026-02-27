import { useEffect, useState, type FormEvent } from 'react';
import { Transaction, VersionedTransaction } from '@solana/web3.js';
import { useAuth } from '@/app/providers/auth-provider';
import {
  createDao,
  getAuthProfile,
  getDaos,
  prepareCommunityMint,
  prepareDaoOnchainCreate,
  type DaoItem,
} from '@/features/dashboard/api/api';
import { DashboardShell } from '@/features/dashboard/components/shell';
import { EmptyState, ErrorState, LoadingState } from '@/features/dashboard/components/state';
import { formatDateTime, shortAddress } from '@/features/dashboard/lib/format';
import { ApiRequestError } from '@/shared/lib/api-client';

type DaoNetwork = 'mainnet-beta' | 'devnet';

const governanceProgramIdByNetwork: Record<DaoNetwork, string> = {
  devnet: 'GTesTBiEWE32WHXXE2S4XbZvA5CrEc4xs6ZgRe895dP',
  'mainnet-beta': 'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw',
};

const knownGovernanceProgramIds = new Set(Object.values(governanceProgramIdByNetwork));

const getDefaultGovernanceProgramId = (network: DaoNetwork): string => governanceProgramIdByNetwork[network];

const resolveGovernanceProgramIdForNetwork = (current: string, network: DaoNetwork): string => {
  const trimmed = current.trim();

  if (trimmed.length === 0 || knownGovernanceProgramIds.has(trimmed)) {
    return getDefaultGovernanceProgramId(network);
  }

  return current;
};

type OnchainFieldErrorKey = 'name' | 'governanceProgramId' | 'authorityWallet' | 'communityMint';
type ImportFieldErrorKey = 'name' | 'realmAddress' | 'governanceProgramId' | 'authorityWallet';
type MintFieldErrorKey = 'name' | 'decimals' | 'authorityWallet';

type FieldErrors<TField extends string> = Partial<Record<TField, string>>;

type SolanaProviderConnectResult = {
  publicKey?: {
    toBase58: () => string;
  };
};

type SolanaProvider = {
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

const getSolanaProvider = (): SolanaProvider | null => {
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

const toFieldErrors = (error: unknown): Record<string, string> => {
  if (!(error instanceof ApiRequestError)) {
    return {};
  }

  const details = error.details;

  if (!details || typeof details !== 'object') {
    return {};
  }

  const fieldErrors = (details as { fieldErrors?: Record<string, string[] | undefined> }).fieldErrors;

  if (!fieldErrors || typeof fieldErrors !== 'object') {
    return {};
  }

  const parsed: Record<string, string> = {};

  Object.entries(fieldErrors).forEach(([field, messages]) => {
    if (!Array.isArray(messages)) {
      return;
    }

    const message = messages.find(
      (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
    );

    if (message) {
      parsed[field] = message;
    }
  });

  return parsed;
};

const withInputErrorClass = (baseClass: string, hasError: boolean): string =>
  `${baseClass}${hasError ? ' input-invalid' : ''}`;

const getExplorerAddressUrl = (address: string, network: DaoNetwork): string =>
  `https://explorer.solana.com/address/${address}${network === 'devnet' ? '?cluster=devnet' : ''}`;

const getRealmDetailUrl = (realmAddress: string, network: DaoNetwork): string =>
  `https://app.realms.today/dao/${realmAddress}${network === 'devnet' ? '?cluster=devnet' : ''}`;

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

const sendPreparedTransaction = async (
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

export const DashboardDaosPage = (): JSX.Element => {
  const { session } = useAuth();
  const [daos, setDaos] = useState<DaoItem[]>([]);
  const [activeTab, setActiveTab] = useState<'onchain' | 'import'>('onchain');
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [isCreatingOnchain, setIsCreatingOnchain] = useState(false);
  const [isCreatingCommunityMint, setIsCreatingCommunityMint] = useState(false);
  const [isCommunityMintModalOpen, setIsCommunityMintModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [onchainError, setOnchainError] = useState<string | null>(null);
  const [onchainSuccess, setOnchainSuccess] = useState<string | null>(null);

  const [importName, setImportName] = useState('');
  const [importNetwork, setImportNetwork] = useState<DaoNetwork>('devnet');
  const [importDescription, setImportDescription] = useState('');
  const [importRealmAddress, setImportRealmAddress] = useState('');
  const [importGovernanceProgramId, setImportGovernanceProgramId] = useState(getDefaultGovernanceProgramId('devnet'));
  const [importAuthorityWallet, setImportAuthorityWallet] = useState('');
  const [importCommunityMint, setImportCommunityMint] = useState('');
  const [importCouncilMint, setImportCouncilMint] = useState('');
  const [importFieldErrors, setImportFieldErrors] = useState<FieldErrors<ImportFieldErrorKey>>({});

  const [onchainName, setOnchainName] = useState('');
  const [onchainNetwork, setOnchainNetwork] = useState<DaoNetwork>('devnet');
  const [onchainDescription, setOnchainDescription] = useState('');
  const [onchainGovernanceProgramId, setOnchainGovernanceProgramId] = useState(getDefaultGovernanceProgramId('devnet'));
  const [onchainAuthorityWallet, setOnchainAuthorityWallet] = useState('');
  const [onchainCommunityMint, setOnchainCommunityMint] = useState('');
  const [onchainCouncilMint, setOnchainCouncilMint] = useState('');
  const [onchainFieldErrors, setOnchainFieldErrors] = useState<FieldErrors<OnchainFieldErrorKey>>({});
  const [mintTokenName, setMintTokenName] = useState('');
  const [mintDecimals, setMintDecimals] = useState('6');
  const [mintAuthorityWallet, setMintAuthorityWallet] = useState('');
  const [mintFieldErrors, setMintFieldErrors] = useState<FieldErrors<MintFieldErrorKey>>({});

  const loadDaos = async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const items = await getDaos({ limit: 100 });
      setDaos(items);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load DAOs');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadDaos();
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadProfile = async (): Promise<void> => {
      if (!session?.accessToken) {
        return;
      }

      try {
        const profile = await getAuthProfile(session.accessToken);

        if (!isMounted) {
          return;
        }

        setImportAuthorityWallet(profile.walletAddress);
        setOnchainAuthorityWallet(profile.walletAddress);
        setMintAuthorityWallet(profile.walletAddress);
      } catch {
        // no-op: DAO form can still be filled manually
      }
    };

    void loadProfile();

    return () => {
      isMounted = false;
    };
  }, [session?.accessToken]);

  const handleImportDao = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setImportError(null);
    setImportSuccess(null);
    setImportFieldErrors({});

    if (!session?.accessToken) {
      setImportError('You must be authenticated to import a DAO.');
      return;
    }

    const nextFieldErrors: FieldErrors<ImportFieldErrorKey> = {};

    if (!importName.trim()) {
      nextFieldErrors.name = 'Name is required.';
    }

    if (!importRealmAddress.trim()) {
      nextFieldErrors.realmAddress = 'Realm address is required.';
    }

    if (!importGovernanceProgramId.trim()) {
      nextFieldErrors.governanceProgramId = 'Governance program ID is required.';
    }

    if (!importAuthorityWallet.trim()) {
      nextFieldErrors.authorityWallet = 'Authority wallet is required.';
    }

    if (Object.keys(nextFieldErrors).length > 0) {
      setImportFieldErrors(nextFieldErrors);
      setImportError('Please fill all required fields.');
      return;
    }

    setIsImporting(true);

    try {
      const created = await createDao(
        {
          name: importName.trim(),
          description: importDescription.trim() || undefined,
          network: importNetwork,
          realmAddress: importRealmAddress.trim(),
          governanceProgramId: importGovernanceProgramId.trim(),
          authorityWallet: importAuthorityWallet.trim(),
          communityMint: importCommunityMint.trim() || undefined,
          councilMint: importCouncilMint.trim() || undefined,
        },
        session.accessToken,
      );

      setImportSuccess(`DAO "${created.name}" imported.`);
      setImportName('');
      setImportDescription('');
      setImportRealmAddress('');
      setImportCommunityMint('');
      setImportCouncilMint('');
      setImportFieldErrors({});
      setDaos((prev) => [created, ...prev]);
    } catch (createDaoError) {
      const fieldErrors = toFieldErrors(createDaoError);
      const validationFieldErrors: FieldErrors<ImportFieldErrorKey> = {};

      if (fieldErrors.name) {
        validationFieldErrors.name = fieldErrors.name;
      }

      if (fieldErrors.realmAddress) {
        validationFieldErrors.realmAddress = fieldErrors.realmAddress;
      }

      if (fieldErrors.governanceProgramId) {
        validationFieldErrors.governanceProgramId = fieldErrors.governanceProgramId;
      }

      if (fieldErrors.authorityWallet) {
        validationFieldErrors.authorityWallet = fieldErrors.authorityWallet;
      }

      if (Object.keys(validationFieldErrors).length > 0) {
        setImportFieldErrors(validationFieldErrors);
      }

      setImportError(createDaoError instanceof Error ? createDaoError.message : 'Unable to import DAO');
    } finally {
      setIsImporting(false);
    }
  };

  const handleCreateOnchainDao = async (): Promise<void> => {
    setOnchainError(null);
    setOnchainSuccess(null);
    setOnchainFieldErrors({});

    if (!session?.accessToken) {
      setOnchainError('You must be authenticated to create an on-chain DAO.');
      return;
    }

    const nextFieldErrors: FieldErrors<OnchainFieldErrorKey> = {};

    if (!onchainName.trim()) {
      nextFieldErrors.name = 'Name is required.';
    }

    if (!onchainGovernanceProgramId.trim()) {
      nextFieldErrors.governanceProgramId = 'Governance program ID is required.';
    }

    if (!onchainAuthorityWallet.trim()) {
      nextFieldErrors.authorityWallet = 'Authority wallet is required.';
    }

    if (!onchainCommunityMint.trim()) {
      nextFieldErrors.communityMint = 'Community mint is required.';
    }

    if (
      onchainNetwork === 'devnet' &&
      onchainGovernanceProgramId.trim() === governanceProgramIdByNetwork['mainnet-beta']
    ) {
      nextFieldErrors.governanceProgramId = `Use devnet governance program ID: ${governanceProgramIdByNetwork.devnet}`;
    }

    if (Object.keys(nextFieldErrors).length > 0) {
      setOnchainFieldErrors(nextFieldErrors);
      setOnchainError('Please fill all required fields.');
      return;
    }

    setIsCreatingOnchain(true);

    try {
      const provider = getSolanaProvider();

      if (!provider) {
        throw new Error('No Solana wallet detected. Install Phantom or another wallet extension.');
      }

      const connectResult = await provider.connect();
      const connectedWallet = connectResult.publicKey?.toBase58() ?? provider.publicKey?.toBase58();

      if (!connectedWallet) {
        throw new Error('Wallet connection failed. Try reconnecting your wallet.');
      }

      const prepared = await prepareDaoOnchainCreate(
        {
          name: onchainName.trim(),
          network: onchainNetwork,
          communityMint: onchainCommunityMint.trim(),
          councilMint: onchainCouncilMint.trim() || undefined,
          governanceProgramId: onchainGovernanceProgramId.trim() || undefined,
          authorityWallet: onchainAuthorityWallet.trim() || undefined,
          programVersion: 3,
        },
        session.accessToken,
      );

      if (connectedWallet !== prepared.authorityWallet) {
        throw new Error('Connected wallet must match authority wallet for non-custodial DAO creation.');
      }

      const signature = await sendPreparedTransaction(
        provider,
        prepared.transactionMessage,
        prepared.transactionBase58,
        prepared.transactionBase64,
      );

      setImportName(onchainName.trim());
      setImportDescription(onchainDescription.trim());
      setImportNetwork(prepared.network);
      setImportRealmAddress(prepared.realmAddress);
      setImportGovernanceProgramId(prepared.governanceProgramId);
      setImportAuthorityWallet(prepared.authorityWallet);
      setImportCommunityMint(onchainCommunityMint.trim());
      setImportCouncilMint(onchainCouncilMint.trim());
      setOnchainFieldErrors({});
      setImportSuccess('On-chain Realm created. Review prefilled fields below and click "Import Existing Realm".');
      setOnchainSuccess(`On-chain Realm created (${prepared.realmAddress.slice(0, 8)}...). Tx: ${signature.slice(0, 12)}...`);
      setActiveTab('import');
    } catch (createDaoError) {
      const fieldErrors = toFieldErrors(createDaoError);
      const validationFieldErrors: FieldErrors<OnchainFieldErrorKey> = {};

      if (fieldErrors.name) {
        validationFieldErrors.name = fieldErrors.name;
      }

      if (fieldErrors.governanceProgramId) {
        validationFieldErrors.governanceProgramId = fieldErrors.governanceProgramId;
      }

      if (fieldErrors.authorityWallet) {
        validationFieldErrors.authorityWallet = fieldErrors.authorityWallet;
      }

      if (fieldErrors.communityMint) {
        validationFieldErrors.communityMint = fieldErrors.communityMint;
      }

      if (Object.keys(validationFieldErrors).length > 0) {
        setOnchainFieldErrors(validationFieldErrors);
      }

      setOnchainError(createDaoError instanceof Error ? createDaoError.message : 'Unable to create on-chain DAO');
    } finally {
      setIsCreatingOnchain(false);
    }
  };

  const handleCreateCommunityMint = async (): Promise<void> => {
    setOnchainError(null);
    setOnchainSuccess(null);
    setMintFieldErrors({});

    if (!session?.accessToken) {
      setOnchainError('You must be authenticated to create a community mint.');
      return;
    }

    const parsedDecimals = Number(mintDecimals.trim());
    const nextFieldErrors: FieldErrors<MintFieldErrorKey> = {};

    if (!mintTokenName.trim()) {
      nextFieldErrors.name = 'Token name is required.';
    }

    if (!Number.isInteger(parsedDecimals) || parsedDecimals < 0 || parsedDecimals > 9) {
      nextFieldErrors.decimals = 'Decimals must be an integer between 0 and 9.';
    }

    if (!mintAuthorityWallet.trim()) {
      nextFieldErrors.authorityWallet = 'Mint authority wallet is required.';
    }

    if (Object.keys(nextFieldErrors).length > 0) {
      setMintFieldErrors(nextFieldErrors);
      setOnchainError('Please fill all required fields.');
      return;
    }

    setIsCreatingCommunityMint(true);

    try {
      const provider = getSolanaProvider();

      if (!provider) {
        throw new Error('No Solana wallet detected. Install Phantom or another wallet extension.');
      }

      const connectResult = await provider.connect();
      const connectedWallet = connectResult.publicKey?.toBase58() ?? provider.publicKey?.toBase58();

      if (!connectedWallet) {
        throw new Error('Wallet connection failed. Try reconnecting your wallet.');
      }

      const prepared = await prepareCommunityMint(
        {
          name: mintTokenName.trim(),
          network: onchainNetwork,
          authorityWallet: mintAuthorityWallet.trim() || undefined,
          decimals: parsedDecimals,
        },
        session.accessToken,
      );

      if (connectedWallet !== prepared.payerWallet) {
        throw new Error('Connected wallet must match the payer wallet to create community mint.');
      }

      const signature = await sendPreparedTransaction(
        provider,
        prepared.transactionMessage,
        prepared.transactionBase58,
        prepared.transactionBase64,
      );

      setOnchainAuthorityWallet(prepared.authorityWallet);
      setMintAuthorityWallet(prepared.authorityWallet);
      setOnchainCommunityMint(prepared.mintAddress);
      setImportCommunityMint(prepared.mintAddress);
      setMintFieldErrors({});
      setOnchainSuccess(
        `Community mint created (${prepared.symbol}) ${prepared.mintAddress.slice(0, 8)}... Tx: ${signature.slice(0, 12)}...`,
      );
      setIsCommunityMintModalOpen(false);
    } catch (createMintError) {
      const fieldErrors = toFieldErrors(createMintError);
      const validationFieldErrors: FieldErrors<MintFieldErrorKey> = {};

      if (fieldErrors.name) {
        validationFieldErrors.name = fieldErrors.name;
      }

      if (fieldErrors.decimals) {
        validationFieldErrors.decimals = fieldErrors.decimals;
      }

      if (fieldErrors.authorityWallet) {
        validationFieldErrors.authorityWallet = fieldErrors.authorityWallet;
      }

      if (Object.keys(validationFieldErrors).length > 0) {
        setMintFieldErrors(validationFieldErrors);
      }

      setOnchainError(createMintError instanceof Error ? createMintError.message : 'Unable to create community mint');
    } finally {
      setIsCreatingCommunityMint(false);
    }
  };

  const openCommunityMintModal = (): void => {
    setOnchainError(null);
    setMintFieldErrors({});
    setMintTokenName((current) => current || onchainName.trim());
    setMintAuthorityWallet((current) => current || onchainAuthorityWallet.trim());
    setMintDecimals((current) => current || '6');
    setIsCommunityMintModalOpen(true);
  };

  return (
    <DashboardShell title="DAOs" description="Create on-chain Realms, then import existing Realm addresses into Daometer.">
      <article className="data-card">
        <div className="data-card-header">
          <h3>DAO Setup</h3>
          {isSetupOpen ? <span className="status-chip">{activeTab === 'onchain' ? 'wallet-sign' : 'register'}</span> : null}
        </div>
        {!isSetupOpen ? (
          <div className="auth-form">
            <p className="hint-text">Start by opening DAO setup, then choose on-chain creation or importing an existing realm.</p>
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                setIsSetupOpen(true);
                setActiveTab('onchain');
              }}
            >
              Create DAO
            </button>
          </div>
        ) : (
          <>
            <div className="auth-mode-switch" role="tablist" aria-label="DAO setup mode">
              <button
                type="button"
                className={`tab-button${activeTab === 'onchain' ? ' tab-button-active' : ''}`}
                onClick={() => setActiveTab('onchain')}
              >
                Create On-chain Realm
              </button>
              <button
                type="button"
                className={`tab-button${activeTab === 'import' ? ' tab-button-active' : ''}`}
                onClick={() => setActiveTab('import')}
              >
                Import Existing Realm
              </button>
            </div>

            <button
              type="button"
              className="secondary-button"
              onClick={() => setIsSetupOpen(false)}
              disabled={isImporting || isCreatingOnchain || isCreatingCommunityMint}
            >
              Close Setup
            </button>

            {activeTab === 'onchain' ? (
              <form className="auth-form" onSubmit={(event) => event.preventDefault()}>
            <label className="input-label">
              Name
              <input
                className={withInputErrorClass('text-input', Boolean(onchainFieldErrors.name))}
                value={onchainName}
                onChange={(event) => {
                  setOnchainName(event.target.value);
                  setOnchainFieldErrors((current) => ({ ...current, name: undefined }));
                }}
                minLength={2}
                aria-invalid={Boolean(onchainFieldErrors.name)}
                required
              />
              {onchainFieldErrors.name ? <span className="field-error">{onchainFieldErrors.name}</span> : null}
            </label>

            <label className="input-label">
              Network
              <select
                className="select-input"
                value={onchainNetwork}
                onChange={(event) => {
                  const nextNetwork = event.target.value as DaoNetwork;
                  setOnchainNetwork(nextNetwork);
                  setOnchainGovernanceProgramId((current) => resolveGovernanceProgramIdForNetwork(current, nextNetwork));
                }}
              >
                <option value="devnet">devnet</option>
                <option value="mainnet-beta">mainnet-beta</option>
              </select>
            </label>

            <label className="input-label">
              Governance Program ID
              <input
                className={withInputErrorClass('text-input', Boolean(onchainFieldErrors.governanceProgramId))}
                value={onchainGovernanceProgramId}
                onChange={(event) => {
                  setOnchainGovernanceProgramId(event.target.value);
                  setOnchainFieldErrors((current) => ({ ...current, governanceProgramId: undefined }));
                }}
                aria-invalid={Boolean(onchainFieldErrors.governanceProgramId)}
                required
              />
              {onchainFieldErrors.governanceProgramId ? (
                <span className="field-error">{onchainFieldErrors.governanceProgramId}</span>
              ) : null}
            </label>

            <label className="input-label">
              Authority Wallet
              <input
                className={withInputErrorClass('text-input', Boolean(onchainFieldErrors.authorityWallet))}
                value={onchainAuthorityWallet}
                onChange={(event) => {
                  setOnchainAuthorityWallet(event.target.value);
                  setOnchainFieldErrors((current) => ({ ...current, authorityWallet: undefined }));
                }}
                aria-invalid={Boolean(onchainFieldErrors.authorityWallet)}
                required
              />
              {onchainFieldErrors.authorityWallet ? (
                <span className="field-error">{onchainFieldErrors.authorityWallet}</span>
              ) : null}
            </label>

            <label className="input-label">
              Community Mint
              <div className="input-with-action">
                <input
                  className={withInputErrorClass('text-input', Boolean(onchainFieldErrors.communityMint))}
                  value={onchainCommunityMint}
                  onChange={(event) => {
                    setOnchainCommunityMint(event.target.value);
                    setOnchainFieldErrors((current) => ({ ...current, communityMint: undefined }));
                  }}
                  aria-invalid={Boolean(onchainFieldErrors.communityMint)}
                  required
                />
                <button
                  type="button"
                  className="secondary-button"
                  disabled={isImporting || isCreatingOnchain || isCreatingCommunityMint}
                  onClick={() => {
                    openCommunityMintModal();
                  }}
                >
                  {isCreatingCommunityMint ? 'Generating...' : 'Generate'}
                </button>
              </div>
              {onchainFieldErrors.communityMint ? <span className="field-error">{onchainFieldErrors.communityMint}</span> : null}
            </label>

            <label className="input-label">
              Council Mint (optional)
              <input className="text-input" value={onchainCouncilMint} onChange={(event) => setOnchainCouncilMint(event.target.value)} />
            </label>

            <label className="input-label">
              Description (optional)
              <textarea className="text-input" value={onchainDescription} onChange={(event) => setOnchainDescription(event.target.value)} />
            </label>

            {onchainError ? <p className="error-text">{onchainError}</p> : null}
            {onchainSuccess ? <p className="success-text">{onchainSuccess}</p> : null}
            <button
              type="button"
              className="primary-button"
              disabled={isImporting || isCreatingOnchain || isCreatingCommunityMint}
              onClick={() => {
                void handleCreateOnchainDao();
              }}
            >
              {isCreatingOnchain ? 'Creating On-chain...' : 'Create On-chain Realm'}
            </button>
              </form>
            ) : (
              <form className="auth-form" onSubmit={handleImportDao}>
            <label className="input-label">
              Name
              <input
                className={withInputErrorClass('text-input', Boolean(importFieldErrors.name))}
                value={importName}
                onChange={(event) => {
                  setImportName(event.target.value);
                  setImportFieldErrors((current) => ({ ...current, name: undefined }));
                }}
                minLength={2}
                aria-invalid={Boolean(importFieldErrors.name)}
                required
              />
              {importFieldErrors.name ? <span className="field-error">{importFieldErrors.name}</span> : null}
            </label>

            <label className="input-label">
              Network
              <select
                className="select-input"
                value={importNetwork}
                onChange={(event) => {
                  const nextNetwork = event.target.value as DaoNetwork;
                  setImportNetwork(nextNetwork);
                  setImportGovernanceProgramId((current) => resolveGovernanceProgramIdForNetwork(current, nextNetwork));
                }}
              >
                <option value="devnet">devnet</option>
                <option value="mainnet-beta">mainnet-beta</option>
              </select>
            </label>

            <label className="input-label">
              Realm Address
              <input
                className={withInputErrorClass('text-input', Boolean(importFieldErrors.realmAddress))}
                value={importRealmAddress}
                onChange={(event) => {
                  setImportRealmAddress(event.target.value);
                  setImportFieldErrors((current) => ({ ...current, realmAddress: undefined }));
                }}
                aria-invalid={Boolean(importFieldErrors.realmAddress)}
                required
              />
              {importFieldErrors.realmAddress ? <span className="field-error">{importFieldErrors.realmAddress}</span> : null}
            </label>

            <label className="input-label">
              Governance Program ID
              <input
                className={withInputErrorClass('text-input', Boolean(importFieldErrors.governanceProgramId))}
                value={importGovernanceProgramId}
                onChange={(event) => {
                  setImportGovernanceProgramId(event.target.value);
                  setImportFieldErrors((current) => ({ ...current, governanceProgramId: undefined }));
                }}
                aria-invalid={Boolean(importFieldErrors.governanceProgramId)}
                required
              />
              {importFieldErrors.governanceProgramId ? (
                <span className="field-error">{importFieldErrors.governanceProgramId}</span>
              ) : null}
            </label>

            <label className="input-label">
              Authority Wallet
              <input
                className={withInputErrorClass('text-input', Boolean(importFieldErrors.authorityWallet))}
                value={importAuthorityWallet}
                onChange={(event) => {
                  setImportAuthorityWallet(event.target.value);
                  setImportFieldErrors((current) => ({ ...current, authorityWallet: undefined }));
                }}
                aria-invalid={Boolean(importFieldErrors.authorityWallet)}
                required
              />
              {importFieldErrors.authorityWallet ? (
                <span className="field-error">{importFieldErrors.authorityWallet}</span>
              ) : null}
            </label>

            <label className="input-label">
              Community Mint (optional)
              <input className="text-input" value={importCommunityMint} onChange={(event) => setImportCommunityMint(event.target.value)} />
            </label>

            <label className="input-label">
              Council Mint (optional)
              <input className="text-input" value={importCouncilMint} onChange={(event) => setImportCouncilMint(event.target.value)} />
            </label>

            <label className="input-label">
              Description (optional)
              <textarea className="text-input" value={importDescription} onChange={(event) => setImportDescription(event.target.value)} />
            </label>

            {importError ? <p className="error-text">{importError}</p> : null}
            {importSuccess ? <p className="success-text">{importSuccess}</p> : null}

            <button type="submit" className="primary-button" disabled={isImporting || isCreatingOnchain}>
              {isImporting ? 'Importing...' : 'Import Existing Realm'}
            </button>
              </form>
            )}
          </>
        )}
      </article>

      {isCommunityMintModalOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Generate Community Mint">
          <form
            className="modal-card auth-form"
            onSubmit={(event) => {
              event.preventDefault();
              void handleCreateCommunityMint();
            }}
          >
            <h3>Generate Community Mint</h3>
            <p>Create a governance token mint with your wallet signature. This mint address will auto-fill Community Mint.</p>

            <label className="input-label">
              Token Name
              <input
                className={withInputErrorClass('text-input', Boolean(mintFieldErrors.name))}
                value={mintTokenName}
                onChange={(event) => {
                  setMintTokenName(event.target.value);
                  setMintFieldErrors((current) => ({ ...current, name: undefined }));
                }}
                minLength={2}
                maxLength={120}
                aria-invalid={Boolean(mintFieldErrors.name)}
                required
              />
              {mintFieldErrors.name ? <span className="field-error">{mintFieldErrors.name}</span> : null}
            </label>

            <label className="input-label">
              Decimals
              <input
                className={withInputErrorClass('text-input', Boolean(mintFieldErrors.decimals))}
                type="number"
                min={0}
                max={9}
                value={mintDecimals}
                onChange={(event) => {
                  setMintDecimals(event.target.value);
                  setMintFieldErrors((current) => ({ ...current, decimals: undefined }));
                }}
                aria-invalid={Boolean(mintFieldErrors.decimals)}
                required
              />
              {mintFieldErrors.decimals ? <span className="field-error">{mintFieldErrors.decimals}</span> : null}
            </label>

            <label className="input-label">
              Mint Authority Wallet
              <input
                className={withInputErrorClass('text-input', Boolean(mintFieldErrors.authorityWallet))}
                value={mintAuthorityWallet}
                onChange={(event) => {
                  setMintAuthorityWallet(event.target.value);
                  setMintFieldErrors((current) => ({ ...current, authorityWallet: undefined }));
                }}
                aria-invalid={Boolean(mintFieldErrors.authorityWallet)}
                required
              />
              {mintFieldErrors.authorityWallet ? (
                <span className="field-error">{mintFieldErrors.authorityWallet}</span>
              ) : null}
            </label>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={isCreatingCommunityMint}
                onClick={() => setIsCommunityMintModalOpen(false)}
              >
                Cancel
              </button>
              <button type="submit" className="primary-button" disabled={isCreatingCommunityMint}>
                {isCreatingCommunityMint ? 'Generating...' : 'Create Mint'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {isLoading ? <LoadingState message="Loading DAOs..." /> : null}
      {!isLoading && error ? <ErrorState message={error} /> : null}
      {!isLoading && !error && daos.length === 0 ? <EmptyState message="No DAOs found yet." /> : null}

      {!isLoading && !error && daos.length > 0 ? (
        <div className="data-grid">
          {daos.map((dao) => (
            <article key={dao.id} className="data-card">
              <div className="data-card-header">
                <div>
                  <h3>{dao.name}</h3>
                  <p className="hint-text">Slug: {dao.slug}</p>
                </div>
                <span className="status-chip">{dao.network}</span>
              </div>
              {dao.description ? <p className="hint-text">{dao.description}</p> : null}

              <div className="dao-metric-grid">
                <div className="dao-metric-item">
                  <span>Auto execute</span>
                  <strong>{dao.automationConfig.autoExecuteEnabled ? 'Enabled' : 'Disabled'}</strong>
                </div>
                <div className="dao-metric-item">
                  <span>Max risk</span>
                  <strong>{dao.automationConfig.maxRiskScore}</strong>
                </div>
                <div className="dao-metric-item">
                  <span>Simulation</span>
                  <strong>{dao.automationConfig.requireSimulation ? 'Required' : 'Optional'}</strong>
                </div>
                <div className="dao-metric-item">
                  <span>Updated</span>
                  <strong>{formatDateTime(dao.updatedAt)}</strong>
                </div>
              </div>

              <div className="dao-address-grid">
                <div className="dao-address-item">
                  <span>Realm</span>
                  <a
                    href={getExplorerAddressUrl(dao.realmAddress, dao.network)}
                    target="_blank"
                    rel="noreferrer"
                    title={dao.realmAddress}
                  >
                    {shortAddress(dao.realmAddress, 6)}
                  </a>
                </div>
                <div className="dao-address-item">
                  <span>Governance Program</span>
                  <a
                    href={getExplorerAddressUrl(dao.governanceProgramId, dao.network)}
                    target="_blank"
                    rel="noreferrer"
                    title={dao.governanceProgramId}
                  >
                    {shortAddress(dao.governanceProgramId, 6)}
                  </a>
                </div>
                <div className="dao-address-item">
                  <span>Authority</span>
                  <a
                    href={getExplorerAddressUrl(dao.authorityWallet, dao.network)}
                    target="_blank"
                    rel="noreferrer"
                    title={dao.authorityWallet}
                  >
                    {shortAddress(dao.authorityWallet, 6)}
                  </a>
                </div>
              </div>

              <div className="dao-card-actions">
                <a
                  className="secondary-button"
                  href={getRealmDetailUrl(dao.realmAddress, dao.network)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open in Realms
                </a>
                <a
                  className="secondary-button"
                  href={getExplorerAddressUrl(dao.realmAddress, dao.network)}
                  target="_blank"
                  rel="noreferrer"
                >
                  View Realm on Explorer
                </a>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </DashboardShell>
  );
};
