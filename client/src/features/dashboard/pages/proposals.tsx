import { useEffect, useState } from 'react';
import { getDaoProposals, getDaos, type DaoItem, type ProposalItem } from '@/features/dashboard/api/api';
import { DaoSelect } from '@/features/dashboard/components/dao-select';
import { DashboardShell } from '@/features/dashboard/components/shell';
import { EmptyState, ErrorState, LoadingState } from '@/features/dashboard/components/state';
import { formatDateTime } from '@/features/dashboard/lib/format';

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
  const [daos, setDaos] = useState<DaoItem[]>([]);
  const [selectedDaoId, setSelectedDaoId] = useState<string | null>(null);
  const [proposals, setProposals] = useState<ProposalItem[]>([]);
  const [isLoadingDaos, setIsLoadingDaos] = useState(true);
  const [isLoadingProposals, setIsLoadingProposals] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    return () => { isMounted = false; };
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
    return () => { isMounted = false; };
  }, [selectedDaoId]);

  const isLoading = isLoadingDaos || isLoadingProposals;

  return (
    <DashboardShell title="Proposals" description="Real proposal states, risk, and execution metadata by DAO.">
      <DaoSelect daos={daos} selectedDaoId={selectedDaoId} onSelect={setSelectedDaoId} />

      {isLoading ? <LoadingState message="Loading proposals..." /> : null}
      {!isLoading && error ? <ErrorState message={error} /> : null}
      {!isLoading && !error && !selectedDaoId ? <EmptyState message="Create a DAO first to view proposals." /> : null}
      {!isLoading && !error && selectedDaoId && proposals.length === 0 ? (
        <EmptyState message="No proposals found for this DAO yet." />
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
                  <td><span className="status-chip status-chip--gray">{proposal.voteScope}</span></td>
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
    </DashboardShell>
  );
};
