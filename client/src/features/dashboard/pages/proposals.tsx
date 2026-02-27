import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/providers/auth-provider';
import {
  getDaoProposals,
  getDaos,
  prepareProposalOnchainExecution,
  type DaoItem,
  type ProposalItem,
} from '@/features/dashboard/api/api';
import { DaoSelect } from '@/features/dashboard/components/dao-select';
import { DashboardShell } from '@/features/dashboard/components/shell';
import { ErrorState, LoadingState } from '@/features/dashboard/components/state';
import { formatDateTime } from '@/features/dashboard/lib/format';
import { getSolanaProvider, sendPreparedTransaction } from '@/shared/solana/wallet';

const getRealmDetailUrl = (realmAddress: string, network: 'mainnet-beta' | 'devnet'): string =>
  `https://app.realms.today/dao/${realmAddress}${network === 'devnet' ? '?cluster=devnet' : ''}`;

const shortAddress = (value: string): string => `${value.slice(0, 6)}...${value.slice(-6)}`;

const stateChip = (state: ProposalItem['state']): JSX.Element => {
  const map: Record<ProposalItem['state'], string> = {
    voting: 'status-chip--yellow',
    succeeded: 'status-chip--green',
    executed: 'status-chip--green',
    draft: 'status-chip--gray',
    defeated: 'status-chip--gray',
    cancelled: 'status-chip--gray',
    'execution-error': 'status-chip--red',
  };
  return <span className={`status-chip ${map[state] ?? ''}`}>{state}</span>;
};

const riskChip = (level: 'safe' | 'warning' | 'critical', score: number): JSX.Element => {
  const map = { safe: 'status-chip--green', warning: 'status-chip--yellow', critical: 'status-chip--red' };
  return <span className={`status-chip ${map[level]}`}>{score} · {level}</span>;
};

const approvalChip = (required: boolean, approved: boolean | null): JSX.Element => {
  if (!required) return <span className="status-chip status-chip--gray">Not required</span>;
  if (approved === true) return <span className="status-chip status-chip--green">Approved</span>;
  if (approved === false) return <span className="status-chip status-chip--red">Rejected</span>;
  return <span className="status-chip status-chip--yellow">Pending</span>;
};

export const DashboardProposalsPage = (): JSX.Element => {
  const { session } = useAuth();
  const [daos, setDaos] = useState<DaoItem[]>([]);
  const [selectedDaoId, setSelectedDaoId] = useState<string | null>(null);
  const [proposals, setProposals] = useState<ProposalItem[]>([]);
  const [isLoadingDaos, setIsLoadingDaos] = useState(true);
  const [isLoadingProposals, setIsLoadingProposals] = useState(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [executingProposalId, setExecutingProposalId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedDao = useMemo(
    () => daos.find((dao) => dao.id === selectedDaoId) ?? null,
    [daos, selectedDaoId],
  );

  useEffect(() => {
    let isMounted = true;

    const loadDaos = async (): Promise<void> => {
      setIsLoadingDaos(true);
      setError(null);

      try {
        const items = await getDaos({ limit: 100 });
        if (!isMounted) return;
        setDaos(items);
        setSelectedDaoId((current) => current ?? items[0]?.id ?? null);
      } catch (loadError) {
        if (!isMounted) return;
        setError(loadError instanceof Error ? loadError.message : 'Unable to load DAOs');
      } finally {
        if (isMounted) setIsLoadingDaos(false);
      }
    };

    void loadDaos();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedDaoId) {
      setProposals([]);
      setIsLoadingProposals(false);
      return;
    }

    let isMounted = true;
    let interval: number | null = null;

    const loadProposals = async (showLoading = true): Promise<void> => {
      if (showLoading) {
        setIsLoadingProposals(true);
      }

      setError(null);

      try {
        const items = await getDaoProposals(selectedDaoId, { limit: 100 });
        if (!isMounted) return;
        setProposals(items);
        setLastRefreshedAt(new Date().toISOString());
      } catch (loadError) {
        if (!isMounted) return;
        setError(loadError instanceof Error ? loadError.message : 'Unable to load proposals');
      } finally {
        if (isMounted && showLoading) {
          setIsLoadingProposals(false);
        }
      }
    };

    void loadProposals(true);

    if (autoRefresh) {
      interval = window.setInterval(() => {
        void loadProposals(false);
      }, 15000);
    }

    return () => {
      isMounted = false;
      if (interval) {
        window.clearInterval(interval);
      }
    };
  }, [selectedDaoId, autoRefresh]);

  const isLoading = isLoadingDaos || isLoadingProposals;

  return (
    <DashboardShell title="Proposals" description="Monitor proposal states, risk, voting timeline, and execution status.">
      <DaoSelect daos={daos} selectedDaoId={selectedDaoId} onSelect={setSelectedDaoId} />

      {selectedDao && !isLoading && !error ? (
        <div className="dao-card-actions">
          <a className="secondary-button" href={getRealmDetailUrl(selectedDao.realmAddress, selectedDao.network)} target="_blank" rel="noreferrer">
            Open DAO in Realms
          </a>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              if (!selectedDaoId) return;
              setIsLoadingProposals(true);
              void getDaoProposals(selectedDaoId, { limit: 100 })
                .then((items) => {
                  setProposals(items);
                  setLastRefreshedAt(new Date().toISOString());
                  setError(null);
                })
                .catch((refreshError) => {
                  setError(refreshError instanceof Error ? refreshError.message : 'Unable to refresh proposals');
                })
                .finally(() => setIsLoadingProposals(false));
            }}
          >
            Refresh
          </button>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(event) => setAutoRefresh(event.target.checked)}
            />
            Auto refresh
          </label>
        </div>
      ) : null}

      {!isLoading && !error ? (
        <p className="hint-text">
          {lastRefreshedAt ? `Last refreshed: ${formatDateTime(lastRefreshedAt)}` : 'No refresh yet'}
        </p>
      ) : null}

      {isLoading ? <LoadingState message="Loading proposals..." /> : null}
      {!isLoading && error ? <ErrorState message={error} /> : null}

      {!isLoading && !error && !selectedDaoId ? (
        <article className="data-card">
          <p>No DAO selected yet.</p>
        </article>
      ) : null}

      {!isLoading && !error && selectedDaoId && proposals.length === 0 ? (
        <article className="data-card">
          <h3>No Proposals Yet</h3>
          <p>Create and publish your proposal from Flows. This page is for tracking proposals after publish.</p>
          <div className="dao-card-actions">
            <a className="secondary-button" href="/dashboard/flows">
              Open Flows
            </a>
          </div>
        </article>
      ) : null}

      {!isLoading && !error && proposals.length > 0 ? (
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>State</th>
                <th>Source</th>
                <th>Risk</th>
                <th>Vote scope</th>
                <th>Voting ends</th>
                <th>Onchain</th>
                <th>Manual approval</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {proposals.map((proposal) => (
                <tr key={proposal.id}>
                  <td>{proposal.title}</td>
                  <td>{stateChip(proposal.state)}</td>
                  <td>
                    <span className={`status-chip ${proposal.onchainExecution.proposalAddress ? 'status-chip--green' : 'status-chip--gray'}`}>
                      {proposal.onchainExecution.proposalAddress ? 'On-chain' : 'Internal'}
                    </span>
                    {proposal.onchainExecution.proposalAddress ? (
                      <p className="hint-text">{shortAddress(proposal.onchainExecution.proposalAddress)}</p>
                    ) : null}
                  </td>
                  <td>{riskChip(proposal.riskLevel, proposal.riskScore)}</td>
                  <td>
                    <span className="status-chip status-chip--gray">{proposal.voteScope}</span>
                  </td>
                  <td>{formatDateTime(proposal.votingEndsAt)}</td>
                  <td>
                    <span className={`status-chip ${proposal.onchainExecution.enabled ? 'status-chip--green' : 'status-chip--gray'}`}>
                      {proposal.onchainExecution.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td>{approvalChip(proposal.manualApproval.required, proposal.manualApproval.approved)}</td>
                  <td>
                    {proposal.onchainExecution.enabled && proposal.state === 'succeeded' ? (
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={executingProposalId === proposal.id || !session?.accessToken}
                        onClick={() => {
                          if (!session?.accessToken) {
                            setError('Connect wallet to execute on-chain transactions.');
                            return;
                          }

                          const run = async (): Promise<void> => {
                            setError(null);
                            setExecutingProposalId(proposal.id);

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

                              const prepared = await prepareProposalOnchainExecution(proposal.id, session.accessToken);

                              for (const tx of prepared.preparedTransactions) {
                                await sendPreparedTransaction(
                                  provider,
                                  tx.transactionMessage,
                                  tx.transactionBase58,
                                  tx.transactionBase64,
                                );
                              }

                              if (selectedDaoId) {
                                const refreshed = await getDaoProposals(selectedDaoId, { limit: 100 });
                                setProposals(refreshed);
                              }
                            } catch (executeError) {
                              setError(executeError instanceof Error ? executeError.message : 'Unable to execute proposal');
                            } finally {
                              setExecutingProposalId(null);
                            }
                          };

                          void run();
                        }}
                      >
                        {executingProposalId === proposal.id ? 'Executing...' : 'Execute with Wallet'}
                      </button>
                    ) : (
                      <span className="status-chip status-chip--gray">N/A</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </DashboardShell>
  );
};
