import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/providers/auth-provider';
import { createProposal, getDaoProposals, getDaos, type DaoItem, type ProposalItem } from '@/features/dashboard/api/api';
import { DaoSelect } from '@/features/dashboard/components/dao-select';
import { DashboardShell } from '@/features/dashboard/components/shell';
import { ErrorState, LoadingState } from '@/features/dashboard/components/state';
import { formatDateTime } from '@/features/dashboard/lib/format';
import { ApiRequestError } from '@/shared/lib/api-client';

const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';

const getRealmDetailUrl = (realmAddress: string, network: 'mainnet-beta' | 'devnet'): string =>
  `https://app.realms.today/dao/${realmAddress}${network === 'devnet' ? '?cluster=devnet' : ''}`;

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
  const [error, setError] = useState<string | null>(null);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [createTitle, setCreateTitle] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createVoteScope, setCreateVoteScope] = useState<'community' | 'council'>('community');
  const [createVotingHours, setCreateVotingHours] = useState('72');

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

    const loadProposals = async (): Promise<void> => {
      setIsLoadingProposals(true);
      setError(null);

      try {
        const items = await getDaoProposals(selectedDaoId, { limit: 100 });
        if (!isMounted) return;
        setProposals(items);
      } catch (loadError) {
        if (!isMounted) return;
        setError(loadError instanceof Error ? loadError.message : 'Unable to load proposals');
      } finally {
        if (isMounted) setIsLoadingProposals(false);
      }
    };

    void loadProposals();
    return () => {
      isMounted = false;
    };
  }, [selectedDaoId]);

  const handleCreateProposal = async (): Promise<void> => {
    setCreateError(null);
    setCreateSuccess(null);

    if (!session?.accessToken) {
      setCreateError('You must be authenticated to create a proposal.');
      return;
    }

    if (!selectedDaoId) {
      setCreateError('Select a DAO first.');
      return;
    }

    if (createTitle.trim().length < 3) {
      setCreateError('Title must be at least 3 characters.');
      return;
    }

    const votingHours = Number(createVotingHours.trim());

    if (!Number.isFinite(votingHours) || votingHours <= 0 || votingHours > 720) {
      setCreateError('Voting duration must be between 1 and 720 hours.');
      return;
    }

    setIsCreating(true);

    try {
      const votingEndsAt = new Date(Date.now() + votingHours * 60 * 60 * 1000).toISOString();
      const created = await createProposal(
        {
          daoId: selectedDaoId,
          title: createTitle.trim(),
          description: createDescription.trim() || undefined,
          voteScope: createVoteScope,
          state: 'draft',
          holdUpSeconds: 0,
          votingEndsAt,
          instructions: [
            {
              index: 0,
              kind: 'custom',
              label: 'Signal / discussion',
              programId: SYSTEM_PROGRAM_ID,
              accounts: [],
              riskScore: 0,
            },
          ],
        },
        session.accessToken,
      );

      setProposals((current) => [created, ...current]);
      setCreateSuccess(`Draft proposal "${created.title}" created.`);
      setCreateTitle('');
      setCreateDescription('');
      setCreateVoteScope('community');
      setCreateVotingHours('72');
      setIsCreateModalOpen(false);
    } catch (createProposalError) {
      if (createProposalError instanceof ApiRequestError) {
        setCreateError(createProposalError.message);
      } else {
        setCreateError(createProposalError instanceof Error ? createProposalError.message : 'Unable to create proposal');
      }
    } finally {
      setIsCreating(false);
    }
  };

  const isLoading = isLoadingDaos || isLoadingProposals;

  return (
    <DashboardShell title="Proposals" description="Real proposal states, risk, and execution metadata by DAO.">
      <DaoSelect daos={daos} selectedDaoId={selectedDaoId} onSelect={setSelectedDaoId} />

      {selectedDao && !isLoading && !error && proposals.length > 0 ? (
        <div className="dao-card-actions">
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              setCreateError(null);
              setIsCreateModalOpen(true);
            }}
          >
            Create Proposal
          </button>
          <a className="secondary-button" href={getRealmDetailUrl(selectedDao.realmAddress, selectedDao.network)} target="_blank" rel="noreferrer">
            Open DAO in Realms
          </a>
        </div>
      ) : null}

      {createSuccess ? <p className="success-text">{createSuccess}</p> : null}
      {createError ? <p className="error-text">{createError}</p> : null}

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
          <p>Create your first proposal here, or create/vote proposals directly in Realms and then sync/import into this app.</p>
          {selectedDao ? (
            <div className="dao-card-actions">
              <button type="button" className="primary-button" onClick={() => setIsCreateModalOpen(true)}>
                Create Proposal
              </button>
              <a className="secondary-button" href={getRealmDetailUrl(selectedDao.realmAddress, selectedDao.network)} target="_blank" rel="noreferrer">
                Open DAO in Realms
              </a>
            </div>
          ) : null}
        </article>
      ) : null}

      {!isLoading && !error && proposals.length > 0 ? (
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>State</th>
                <th>Risk</th>
                <th>Vote scope</th>
                <th>Voting ends</th>
                <th>Onchain</th>
                <th>Manual approval</th>
              </tr>
            </thead>
            <tbody>
              {proposals.map((proposal) => (
                <tr key={proposal.id}>
                  <td>{proposal.title}</td>
                  <td>{stateChip(proposal.state)}</td>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {isCreateModalOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Create Proposal">
          <form
            className="modal-card auth-form"
            onSubmit={(event) => {
              event.preventDefault();
              void handleCreateProposal();
            }}
          >
            <h3>Create Proposal</h3>
            <p>This creates an internal draft proposal record in Daometer for the selected DAO.</p>

            <label className="input-label">
              Title
              <input
                className="text-input"
                value={createTitle}
                onChange={(event) => setCreateTitle(event.target.value)}
                minLength={3}
                maxLength={200}
                required
              />
            </label>

            <label className="input-label">
              Description (optional)
              <textarea
                className="text-input"
                value={createDescription}
                onChange={(event) => setCreateDescription(event.target.value)}
                maxLength={5000}
              />
            </label>

            <label className="input-label">
              Vote scope
              <select
                className="select-input"
                value={createVoteScope}
                onChange={(event) => setCreateVoteScope(event.target.value as 'community' | 'council')}
              >
                <option value="community">community</option>
                <option value="council">council</option>
              </select>
            </label>

            <label className="input-label">
              Voting duration (hours)
              <input
                className="text-input"
                type="number"
                min={1}
                max={720}
                value={createVotingHours}
                onChange={(event) => setCreateVotingHours(event.target.value)}
                required
              />
            </label>

            <div className="modal-actions">
              <button type="button" className="secondary-button" disabled={isCreating} onClick={() => setIsCreateModalOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="primary-button" disabled={isCreating}>
                {isCreating ? 'Creating...' : 'Create Draft'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </DashboardShell>
  );
};
