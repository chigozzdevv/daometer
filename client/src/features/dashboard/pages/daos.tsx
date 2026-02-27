import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/app/providers/auth-provider';
import {
  createDao,
  getAuthProfile,
  getDaos,
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

const sendPreparedTransaction = async (provider: SolanaProvider, transactionBase64: string): Promise<string> => {
  const transactionBytes = base64ToBytes(transactionBase64);

  if (typeof provider.signAndSendTransaction === 'function') {
    try {
      const result = await provider.signAndSendTransaction(transactionBytes, {
        preflightCommitment: 'confirmed',
      });
      const signature = extractSignature(result);

      if (signature) {
        return signature;
      }
    } catch {
      // fallback to provider.request for wallets that only support the RPC-style API
    }
  }

  if (typeof provider.request === 'function') {
    try {
      const result = await provider.request({
        method: 'signAndSendTransaction',
        params: {
          transaction: transactionBase64,
          encoding: 'base64',
        },
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
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isCreatingOnchain, setIsCreatingOnchain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [network, setNetwork] = useState<'mainnet-beta' | 'devnet'>('devnet');
  const [description, setDescription] = useState('');
  const [realmAddress, setRealmAddress] = useState('');
  const [governanceProgramId, setGovernanceProgramId] = useState(defaultGovernanceProgramId);
  const [authorityWallet, setAuthorityWallet] = useState('');
  const [communityMint, setCommunityMint] = useState('');
  const [councilMint, setCouncilMint] = useState('');

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

        setAuthorityWallet(profile.walletAddress);
      } catch {
        // no-op: DAO form can still be filled manually
      }
    };

    void loadProfile();

    return () => {
      isMounted = false;
    };
  }, [session?.accessToken]);

  const handleCreateDao = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setCreateError(null);
    setCreateSuccess(null);

    if (!session?.accessToken) {
      setCreateError('You must be authenticated to create a DAO.');
      return;
    }

    if (!realmAddress.trim()) {
      setCreateError('Realm address is required to register an existing DAO.');
      return;
    }

    setIsCreating(true);

    try {
      const created = await createDao(
        {
          name: name.trim(),
          description: description.trim() || undefined,
          network,
          realmAddress: realmAddress.trim(),
          governanceProgramId: governanceProgramId.trim(),
          authorityWallet: authorityWallet.trim(),
          communityMint: communityMint.trim() || undefined,
          councilMint: councilMint.trim() || undefined,
        },
        session.accessToken,
      );

      setCreateSuccess(`DAO "${created.name}" created.`);
      setName('');
      setDescription('');
      setRealmAddress('');
      setAuthorityWallet('');
      setCommunityMint('');
      setCouncilMint('');
      setDaos((prev) => [created, ...prev]);
    } catch (createDaoError) {
      setCreateError(createDaoError instanceof Error ? createDaoError.message : 'Unable to create DAO');
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateOnchainDao = async (): Promise<void> => {
    setCreateError(null);
    setCreateSuccess(null);

    if (!session?.accessToken) {
      setCreateError('You must be authenticated to create an on-chain DAO.');
      return;
    }

    if (!communityMint.trim()) {
      setCreateError('Community mint is required to create a Realm on-chain.');
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
          name: name.trim(),
          network,
          communityMint: communityMint.trim(),
          councilMint: councilMint.trim() || undefined,
          governanceProgramId: governanceProgramId.trim() || undefined,
          authorityWallet: authorityWallet.trim() || undefined,
          programVersion: 3,
        },
        session.accessToken,
      );

      if (connectedWallet !== prepared.authorityWallet) {
        throw new Error('Connected wallet must match authority wallet for non-custodial DAO creation.');
      }

      const signature = await sendPreparedTransaction(provider, prepared.transactionBase64);
      const createdDao = await createDao(
        {
          name: name.trim(),
          description: description.trim() || undefined,
          network: prepared.network,
          realmAddress: prepared.realmAddress,
          governanceProgramId: prepared.governanceProgramId,
          authorityWallet: prepared.authorityWallet,
          communityMint: communityMint.trim() || undefined,
          councilMint: councilMint.trim() || undefined,
        },
        session.accessToken,
      );

      setDaos((prev) => [createdDao, ...prev.filter((dao) => dao.id !== createdDao.id)]);
      setRealmAddress(prepared.realmAddress);
      setCreateSuccess(
        `On-chain Realm created (${prepared.realmAddress.slice(0, 8)}...) and registered. Tx: ${signature.slice(0, 12)}...`,
      );
    } catch (createDaoError) {
      setCreateError(createDaoError instanceof Error ? createDaoError.message : 'Unable to create on-chain DAO');
    } finally {
      setIsCreatingOnchain(false);
    }
  };

  return (
    <DashboardShell title="DAOs" description="Register and manage Realms DAOs by realm/governance addresses.">
      <article className="data-card">
        <div className="data-card-header">
          <h3>Create DAO Record</h3>
          <span className="status-chip">wallet-auth</span>
        </div>
        <form className="auth-form" onSubmit={handleCreateDao}>
          <label className="input-label">
            Name
            <input className="text-input" value={name} onChange={(event) => setName(event.target.value)} minLength={2} required />
          </label>

          <label className="input-label">
            Network
            <select className="select-input" value={network} onChange={(event) => setNetwork(event.target.value as 'mainnet-beta' | 'devnet')}>
              <option value="devnet">devnet</option>
              <option value="mainnet-beta">mainnet-beta</option>
            </select>
          </label>

          <label className="input-label">
            Realm Address (for register-existing)
            <input className="text-input" value={realmAddress} onChange={(event) => setRealmAddress(event.target.value)} />
          </label>

          <label className="input-label">
            Governance Program ID
            <input className="text-input" value={governanceProgramId} onChange={(event) => setGovernanceProgramId(event.target.value)} required />
          </label>

          <label className="input-label">
            Authority Wallet
            <input className="text-input" value={authorityWallet} onChange={(event) => setAuthorityWallet(event.target.value)} required />
          </label>

          <label className="input-label">
            Community Mint (optional)
            <input className="text-input" value={communityMint} onChange={(event) => setCommunityMint(event.target.value)} />
          </label>

          <label className="input-label">
            Council Mint (optional)
            <input className="text-input" value={councilMint} onChange={(event) => setCouncilMint(event.target.value)} />
          </label>

          <label className="input-label">
            Description (optional)
            <textarea className="text-input" value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>

          {createError ? <p className="error-text">{createError}</p> : null}
          {createSuccess ? <p className="success-text">{createSuccess}</p> : null}

          <button type="submit" className="primary-button" disabled={isCreating || isCreatingOnchain}>
            {isCreating ? 'Creating...' : 'Create DAO'}
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={isCreating || isCreatingOnchain}
            onClick={() => {
              void handleCreateOnchainDao();
            }}
          >
            {isCreatingOnchain ? 'Creating On-chain...' : 'Create On-chain Realm + Register'}
          </button>
        </form>
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
