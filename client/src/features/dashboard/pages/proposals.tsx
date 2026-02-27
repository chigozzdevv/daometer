import { useEffect, useState } from 'react';
import { getDaoProposals, getDaos, type DaoItem, type ProposalItem } from '@/features/dashboard/api/api';
import { DaoSelect } from '@/features/dashboard/components/dao-select';
import { DashboardShell } from '@/features/dashboard/components/shell';
import { EmptyState, ErrorState, LoadingState } from '@/features/dashboard/components/state';
import { formatDateTime } from '@/features/dashboard/lib/format';

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

        if (!isMounted) {
          return;
        }

        setDaos(items);
        setSelectedDaoId((current) => current ?? items[0]?.id ?? null);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : 'Unable to load DAOs');
      } finally {
        if (isMounted) {
          setIsLoadingDaos(false);
        }
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

        if (!isMounted) {
          return;
        }

        setProposals(items);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : 'Unable to load proposals');
      } finally {
        if (isMounted) {
          setIsLoadingProposals(false);
        }
      }
    };

    void loadProposals();

    return () => {
      isMounted = false;
    };
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
                <th>Vote Scope</th>
                <th>Voting Ends</th>
                <th>Onchain</th>
                <th>Manual Approval</th>
              </tr>
            </thead>
            <tbody>
              {proposals.map((proposal) => (
                <tr key={proposal.id}>
                  <td>{proposal.title}</td>
                  <td>{proposal.state}</td>
                  <td>{proposal.riskScore}</td>
                  <td>{proposal.voteScope}</td>
                  <td>{formatDateTime(proposal.votingEndsAt)}</td>
                  <td>{proposal.onchainExecution.enabled ? 'Enabled' : 'Disabled'}</td>
                  <td>
                    {proposal.manualApproval.required
                      ? proposal.manualApproval.approved === true
                        ? 'Approved'
                        : proposal.manualApproval.approved === false
                          ? 'Rejected'
                          : 'Pending'
                      : 'Not required'}
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
