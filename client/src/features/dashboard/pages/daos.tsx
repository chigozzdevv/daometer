import { useEffect, useState, type FormEvent } from 'react';
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

const defaultGovernanceProgramId = 'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw';

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

  const candidate = (window as unknown as { solana?: SolanaProvider }).solana;

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
  transactionBase64: string,
): Promise<string> => {
  if (typeof provider.request === 'function') {
    try {
      const result = await provider.request({
        method: 'signAndSendTransaction',
        params: {
          message: transactionMessage,
          options: {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
          },
        },
      });
      const signature = extractSignature(result);

      if (signature) {
        return signature;
      }
    } catch {
      // fallback to non-standard params used by some injected providers
    }
  }

  if (typeof provider.signAndSendTransaction === 'function') {
    try {
      const transactionBytes = base64ToBytes(transactionBase64);
      const result = await provider.signAndSendTransaction(transactionBytes, {
        preflightCommitment: 'confirmed',
      });
      const signature = extractSignature(result);

      if (signature) {
        return signature;
      }
    } catch {
      // no-op: emit a final error below
    }
  }

  throw new Error('Wallet does not support signAndSendTransaction for prepared transactions.');
};

export const DashboardDaosPage = (): JSX.Element => {
  const { session } = useAuth();
  const [daos, setDaos] = useState<DaoItem[]>([]);
  const [activeTab, setActiveTab] = useState<'onchain' | 'import'>('onchain');
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [isCreatingOnchain, setIsCreatingOnchain] = useState(false);
  const [isCreatingCommunityMint, setIsCreatingCommunityMint] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [onchainError, setOnchainError] = useState<string | null>(null);
  const [onchainSuccess, setOnchainSuccess] = useState<string | null>(null);

  const [importName, setImportName] = useState('');
  const [importNetwork, setImportNetwork] = useState<'mainnet-beta' | 'devnet'>('devnet');
  const [importDescription, setImportDescription] = useState('');
  const [importRealmAddress, setImportRealmAddress] = useState('');
  const [importGovernanceProgramId, setImportGovernanceProgramId] = useState(defaultGovernanceProgramId);
  const [importAuthorityWallet, setImportAuthorityWallet] = useState('');
  const [importCommunityMint, setImportCommunityMint] = useState('');
  const [importCouncilMint, setImportCouncilMint] = useState('');

  const [onchainName, setOnchainName] = useState('');
  const [onchainNetwork, setOnchainNetwork] = useState<'mainnet-beta' | 'devnet'>('devnet');
  const [onchainDescription, setOnchainDescription] = useState('');
  const [onchainGovernanceProgramId, setOnchainGovernanceProgramId] = useState(defaultGovernanceProgramId);
  const [onchainAuthorityWallet, setOnchainAuthorityWallet] = useState('');
  const [onchainCommunityMint, setOnchainCommunityMint] = useState('');
  const [onchainCouncilMint, setOnchainCouncilMint] = useState('');

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

    if (!session?.accessToken) {
      setImportError('You must be authenticated to import a DAO.');
      return;
    }

    if (!importRealmAddress.trim()) {
      setImportError('Realm address is required to import an existing DAO.');
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
      setDaos((prev) => [created, ...prev]);
    } catch (createDaoError) {
      setImportError(createDaoError instanceof Error ? createDaoError.message : 'Unable to import DAO');
    } finally {
      setIsImporting(false);
    }
  };

  const handleCreateOnchainDao = async (): Promise<void> => {
    setOnchainError(null);
    setOnchainSuccess(null);

    if (!session?.accessToken) {
      setOnchainError('You must be authenticated to create an on-chain DAO.');
      return;
    }

    if (!onchainCommunityMint.trim()) {
      setOnchainError('Community mint is required to create a Realm on-chain.');
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
      setImportSuccess('On-chain Realm created. Review prefilled fields below and click "Import Existing Realm".');
      setOnchainSuccess(`On-chain Realm created (${prepared.realmAddress.slice(0, 8)}...). Tx: ${signature.slice(0, 12)}...`);
      setActiveTab('import');
    } catch (createDaoError) {
      setOnchainError(createDaoError instanceof Error ? createDaoError.message : 'Unable to create on-chain DAO');
    } finally {
      setIsCreatingOnchain(false);
    }
  };

  const handleCreateCommunityMint = async (): Promise<void> => {
    setOnchainError(null);
    setOnchainSuccess(null);

    if (!session?.accessToken) {
      setOnchainError('You must be authenticated to create a community mint.');
      return;
    }

    if (!onchainName.trim()) {
      setOnchainError('DAO name is required to generate a token symbol and mint.');
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
          name: onchainName.trim(),
          network: onchainNetwork,
          authorityWallet: onchainAuthorityWallet.trim() || undefined,
          decimals: 6,
        },
        session.accessToken,
      );

      if (connectedWallet !== prepared.payerWallet) {
        throw new Error('Connected wallet must match the payer wallet to create community mint.');
      }

      const signature = await sendPreparedTransaction(
        provider,
        prepared.transactionMessage,
        prepared.transactionBase64,
      );

      setOnchainAuthorityWallet(prepared.authorityWallet);
      setOnchainCommunityMint(prepared.mintAddress);
      setImportCommunityMint(prepared.mintAddress);
      setOnchainSuccess(
        `Community mint created (${prepared.symbol}) ${prepared.mintAddress.slice(0, 8)}... Tx: ${signature.slice(0, 12)}...`,
      );
    } catch (createMintError) {
      setOnchainError(createMintError instanceof Error ? createMintError.message : 'Unable to create community mint');
    } finally {
      setIsCreatingCommunityMint(false);
    }
  };

  return (
    <DashboardShell title="DAOs" description="Create on-chain Realms, then import existing Realm addresses into Daometer.">
      <article className="data-card">
        <div className="data-card-header">
          <h3>DAO Setup</h3>
          <span className="status-chip">{activeTab === 'onchain' ? 'wallet-sign' : 'register'}</span>
        </div>
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

        {activeTab === 'onchain' ? (
          <form className="auth-form" onSubmit={(event) => event.preventDefault()}>
            <label className="input-label">
              Name
              <input className="text-input" value={onchainName} onChange={(event) => setOnchainName(event.target.value)} minLength={2} required />
            </label>

            <label className="input-label">
              Network
              <select className="select-input" value={onchainNetwork} onChange={(event) => setOnchainNetwork(event.target.value as 'mainnet-beta' | 'devnet')}>
                <option value="devnet">devnet</option>
                <option value="mainnet-beta">mainnet-beta</option>
              </select>
            </label>

            <label className="input-label">
              Governance Program ID
              <input
                className="text-input"
                value={onchainGovernanceProgramId}
                onChange={(event) => setOnchainGovernanceProgramId(event.target.value)}
                required
              />
            </label>

            <label className="input-label">
              Authority Wallet
              <input className="text-input" value={onchainAuthorityWallet} onChange={(event) => setOnchainAuthorityWallet(event.target.value)} required />
            </label>

            <label className="input-label">
              Community Mint
              <input className="text-input" value={onchainCommunityMint} onChange={(event) => setOnchainCommunityMint(event.target.value)} required />
            </label>

            <button
              type="button"
              className="secondary-button"
              disabled={isImporting || isCreatingOnchain || isCreatingCommunityMint}
              onClick={() => {
                void handleCreateCommunityMint();
              }}
            >
              {isCreatingCommunityMint ? 'Generating Community Mint...' : 'Generate Community Mint'}
            </button>

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
              <input className="text-input" value={importName} onChange={(event) => setImportName(event.target.value)} minLength={2} required />
            </label>

            <label className="input-label">
              Network
              <select className="select-input" value={importNetwork} onChange={(event) => setImportNetwork(event.target.value as 'mainnet-beta' | 'devnet')}>
                <option value="devnet">devnet</option>
                <option value="mainnet-beta">mainnet-beta</option>
              </select>
            </label>

            <label className="input-label">
              Realm Address
              <input className="text-input" value={importRealmAddress} onChange={(event) => setImportRealmAddress(event.target.value)} required />
            </label>

            <label className="input-label">
              Governance Program ID
              <input
                className="text-input"
                value={importGovernanceProgramId}
                onChange={(event) => setImportGovernanceProgramId(event.target.value)}
                required
              />
            </label>

            <label className="input-label">
              Authority Wallet
              <input className="text-input" value={importAuthorityWallet} onChange={(event) => setImportAuthorityWallet(event.target.value)} required />
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
      </article>

      {isLoading ? <LoadingState message="Loading DAOs..." /> : null}
      {!isLoading && error ? <ErrorState message={error} /> : null}
      {!isLoading && !error && daos.length === 0 ? <EmptyState message="No DAOs found yet." /> : null}

      {!isLoading && !error && daos.length > 0 ? (
        <div className="data-grid">
          {daos.map((dao) => (
            <article key={dao.id} className="data-card">
              <div className="data-card-header">
                <h3>{dao.name}</h3>
                <span className="status-chip">{dao.network}</span>
              </div>
              <dl>
                <div>
                  <dt>Slug</dt>
                  <dd>{dao.slug}</dd>
                </div>
                <div>
                  <dt>Realm</dt>
                  <dd title={dao.realmAddress}>{shortAddress(dao.realmAddress, 6)}</dd>
                </div>
                <div>
                  <dt>Governance Program</dt>
                  <dd title={dao.governanceProgramId}>{shortAddress(dao.governanceProgramId, 6)}</dd>
                </div>
                <div>
                  <dt>Authority</dt>
                  <dd title={dao.authorityWallet}>{shortAddress(dao.authorityWallet, 6)}</dd>
                </div>
                <div>
                  <dt>Auto execute</dt>
                  <dd>{dao.automationConfig.autoExecuteEnabled ? 'Enabled' : 'Disabled'}</dd>
                </div>
                <div>
                  <dt>Max risk score</dt>
                  <dd>{dao.automationConfig.maxRiskScore}</dd>
                </div>
                <div>
                  <dt>Require simulation</dt>
                  <dd>{dao.automationConfig.requireSimulation ? 'Yes' : 'No'}</dd>
                </div>
                <div>
                  <dt>Updated</dt>
                  <dd>{formatDateTime(dao.updatedAt)}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      ) : null}
    </DashboardShell>
  );
};
