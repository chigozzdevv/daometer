import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/providers/auth-provider';
import { getAuthProfile, getDaos, getWorkflows, type DaoItem, type WorkflowItem } from '@/features/dashboard/api/api';
import { DaoSelect } from '@/features/dashboard/components/dao-select';
import { DashboardShell } from '@/features/dashboard/components/shell';
import { EmptyState, ErrorState, LoadingState } from '@/features/dashboard/components/state';
import { ApiRequestError } from '@/shared/lib/api-client';

export const DashboardWorkflowsPage = (): JSX.Element => {
  const { session } = useAuth();
  const [allDaos, setAllDaos] = useState<DaoItem[]>([]);
  const [selectedDaoId, setSelectedDaoId] = useState<string | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [isLoadingDaos, setIsLoadingDaos] = useState(true);
  const [isLoadingWorkflows, setIsLoadingWorkflows] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadManagedDaos = async (): Promise<void> => {
      if (!session?.accessToken) {
        setError('Sign in to load workflows.');
        setIsLoadingDaos(false);
        setIsLoadingWorkflows(false);
        return;
      }

      setIsLoadingDaos(true);
      setError(null);

      try {
        const [profile, daos] = await Promise.all([getAuthProfile(session.accessToken), getDaos({ limit: 100 })]);
        const managedDaos = daos.filter((dao) => dao.createdBy === profile.id);

        if (!isMounted) {
          return;
        }

        setAllDaos(managedDaos);

        if (managedDaos.length === 0) {
          setSelectedDaoId(null);
          setWorkflows([]);
          return;
        }

        const daoId = managedDaos[0].id;
        setSelectedDaoId(daoId);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        if (loadError instanceof ApiRequestError && loadError.status === 403) {
          setError('You can only view workflows for DAOs you manage.');
        } else {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load workflows');
        }
      } finally {
        if (isMounted) {
          setIsLoadingDaos(false);
        }
      }
    };

    void loadManagedDaos();

    return () => {
      isMounted = false;
    };
  }, [session?.accessToken]);

  useEffect(() => {
    if (!session?.accessToken || !selectedDaoId) {
      setWorkflows([]);
      setIsLoadingWorkflows(false);
      return;
    }

    let isMounted = true;

    const loadWorkflows = async (): Promise<void> => {
      setIsLoadingWorkflows(true);
      setError(null);

      try {
        const rules = await getWorkflows(selectedDaoId, session.accessToken, { limit: 100 });

        if (!isMounted) {
          return;
        }

        setWorkflows(rules);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        if (loadError instanceof ApiRequestError && loadError.status === 403) {
          setError('You can only view workflows for DAOs you manage.');
        } else {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load workflows');
        }
      } finally {
        if (isMounted) {
          setIsLoadingWorkflows(false);
        }
      }
    };

    void loadWorkflows();

    return () => {
      isMounted = false;
    };
  }, [selectedDaoId, session?.accessToken]);

  const enabledCount = useMemo(() => workflows.filter((workflow) => workflow.enabled).length, [workflows]);
  const isLoading = isLoadingDaos || isLoadingWorkflows;

  return (
    <DashboardShell title="Workflows" description="Rule triggers, filters, and action branches for managed DAOs.">
      <DaoSelect daos={allDaos} selectedDaoId={selectedDaoId} onSelect={setSelectedDaoId} />

      {isLoading ? <LoadingState message="Loading workflows..." /> : null}
      {!isLoading && error ? <ErrorState message={error} /> : null}
      {!isLoading && !error && allDaos.length === 0 ? (
        <EmptyState message="You are not managing any DAO yet, so no workflows are available." />
      ) : null}
      {!isLoading && !error && allDaos.length > 0 && workflows.length === 0 ? (
        <EmptyState message="No workflow rules found for the selected DAO." />
      ) : null}

      {!isLoading && !error && workflows.length > 0 ? (
        <>
          <div className="metric-grid">
            <article className="metric-card">
              <p>Total rules</p>
              <h3>{workflows.length}</h3>
            </article>
            <article className="metric-card">
              <p>Enabled rules</p>
              <h3>{enabledCount}</h3>
            </article>
          </div>

          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Enabled</th>
                  <th>Trigger</th>
                  <th>Offset</th>
                  <th>On true actions</th>
                  <th>On false actions</th>
                </tr>
              </thead>
              <tbody>
                {workflows.map((workflow) => (
                  <tr key={workflow.id}>
                    <td>{workflow.name}</td>
                    <td>{workflow.enabled ? 'Yes' : 'No'}</td>
                    <td>{workflow.trigger.type}</td>
                    <td>{workflow.trigger.offsetMinutes} min</td>
                    <td>{workflow.actions.onTrue.length}</td>
                    <td>{workflow.actions.onFalse.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </DashboardShell>
  );
};
