import { useEffect, useState } from 'react';
import { useAuth } from '@/app/providers/auth-provider';
import {
  getAuthProfile,
  getDaoProposals,
  getDaos,
  getFlows,
  getWorkflows,
  type DaoItem,
} from '@/features/dashboard/api/api';
import { MetricCard } from '@/features/dashboard/components/metric';
import { DashboardShell } from '@/features/dashboard/components/shell';
import { ErrorState, LoadingState } from '@/features/dashboard/components/state';
import { ApiRequestError } from '@/shared/lib/api-client';

type OverviewMetrics = {
  daoCount: number;
  managedDaoCount: number;
  publishedFlowCount: number;
  draftFlowCount: number;
  votingProposalCount: number;
  enabledWorkflowCount: number | null;
};

export const DashboardOverviewPage = (): JSX.Element => {
  const { session } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<OverviewMetrics>({
    daoCount: 0,
    managedDaoCount: 0,
    publishedFlowCount: 0,
    draftFlowCount: 0,
    votingProposalCount: 0,
    enabledWorkflowCount: 0,
  });

  useEffect(() => {
    let isMounted = true;

    const load = async (): Promise<void> => {
      setIsLoading(true);
      setError(null);

      try {
        const [daos, flows] = await Promise.all([getDaos({ limit: 100 }), getFlows({ limit: 100 })]);

        const proposalCountPromises = daos.map((dao) => getDaoProposals(dao.id, { limit: 100 }));
        const proposalLists = await Promise.all(proposalCountPromises);
        const votingProposalCount = proposalLists.flat().filter((proposal) => proposal.state === 'voting').length;

        let managedDaos: DaoItem[] = [];
        let enabledWorkflowCount: number | null = 0;

        if (session?.accessToken) {
          const profile = await getAuthProfile(session.accessToken);
          managedDaos = daos.filter((dao) => dao.createdBy === profile.id);

          const workflowLists = await Promise.all(
            managedDaos.map((dao) =>
              getWorkflows(dao.id, session.accessToken).catch((workflowError) => {
                if (workflowError instanceof ApiRequestError && workflowError.status === 403) {
                  return [];
                }

                throw workflowError;
              }),
            ),
          );

          enabledWorkflowCount = workflowLists.flat().filter((rule) => rule.enabled).length;
        }

        if (!isMounted) {
          return;
        }

        setMetrics({
          daoCount: daos.length,
          managedDaoCount: managedDaos.length,
          publishedFlowCount: flows.filter((flow) => flow.status === 'published').length,
          draftFlowCount: flows.filter((flow) => flow.status === 'draft').length,
          votingProposalCount,
          enabledWorkflowCount,
        });
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : 'Unable to load overview');
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, [session?.accessToken]);

  return (
    <DashboardShell
      title="Overview"
      description="Live governance and automation health pulled from your backend data."
    >
      {isLoading ? <LoadingState message="Loading overview metrics..." /> : null}
      {!isLoading && error ? <ErrorState message={error} /> : null}

      {!isLoading && !error ? (
        <div className="metric-grid">
          <MetricCard label="DAOs indexed" value={metrics.daoCount.toString()} />
          <MetricCard label="Managed DAOs" value={metrics.managedDaoCount.toString()} />
          <MetricCard label="Published flows" value={metrics.publishedFlowCount.toString()} />
          <MetricCard label="Draft flows" value={metrics.draftFlowCount.toString()} />
          <MetricCard label="Proposals in voting" value={metrics.votingProposalCount.toString()} />
          <MetricCard
            label="Enabled workflows"
            value={metrics.enabledWorkflowCount === null ? 'N/A' : metrics.enabledWorkflowCount.toString()}
          />
        </div>
      ) : null}
    </DashboardShell>
  );
};
