import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/providers/auth-provider';
import { getAuthProfile, getExecutionJobs, type ExecutionJobItem } from '@/features/dashboard/api/api';
import { DashboardShell } from '@/features/dashboard/components/shell';
import { EmptyState, ErrorState, LoadingState } from '@/features/dashboard/components/state';
import { formatDateTime } from '@/features/dashboard/lib/format';
import { ApiRequestError } from '@/shared/lib/api-client';

export const DashboardExecutionPage = (): JSX.Element => {
  const { session } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [jobs, setJobs] = useState<ExecutionJobItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const load = async (): Promise<void> => {
      if (!session?.accessToken) {
        setError('Sign in to load execution jobs.');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const profile = await getAuthProfile(session.accessToken);
        const adminAccess = profile.roles.includes('admin');

        if (!adminAccess) {
          if (isMounted) {
            setIsAdmin(false);
            setJobs([]);
          }
          return;
        }

        if (isMounted) {
          setIsAdmin(true);
        }

        const items = await getExecutionJobs(session.accessToken, { limit: 100 });
        if (isMounted) {
          setJobs(items);
        }
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        if (loadError instanceof ApiRequestError && loadError.status === 401) {
          setError('Session expired. Please sign in again.');
          return;
        }

        if (loadError instanceof ApiRequestError && loadError.status === 403) {
          setIsAdmin(false);
          setJobs([]);
        } else {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load execution jobs');
        }
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

  const activeCount = useMemo(
    () => jobs.filter((job) => job.status === 'pending' || job.status === 'running').length,
    [jobs],
  );
  const failedCount = useMemo(() => jobs.filter((job) => job.status === 'failed').length, [jobs]);

  return (
    <DashboardShell title="Executions" description="Queue visibility from execution jobs and retry status.">
      {isLoading ? <LoadingState message="Loading execution jobs..." /> : null}
      {!isLoading && error ? <ErrorState message={error} /> : null}
      {!isLoading && !error && isAdmin === false ? (
        <EmptyState message="Execution queue is an admin-only console and is hidden for member dashboards." />
      ) : null}
      {!isLoading && !error && isAdmin && jobs.length === 0 ? <EmptyState message="No execution jobs found." /> : null}

      {!isLoading && !error && isAdmin && jobs.length > 0 ? (
        <>
          <div className="metric-grid">
            <article className="metric-card">
              <p>Active jobs</p>
              <h3>{activeCount}</h3>
            </article>
            <article className="metric-card">
              <p>Failed jobs</p>
              <h3>{failedCount}</h3>
            </article>
            <article className="metric-card">
              <p>Total jobs</p>
              <h3>{jobs.length}</h3>
            </article>
          </div>

          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>DAO</th>
                  <th>Proposal</th>
                  <th>Attempts</th>
                  <th>Next run</th>
                  <th>Last error</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td>{job.status}</td>
                    <td>{job.daoId}</td>
                    <td>{job.proposalId}</td>
                    <td>
                      {job.attemptCount}/{job.maxRetries}
                    </td>
                    <td>{formatDateTime(job.nextRunAt)}</td>
                    <td>{job.lastError ?? 'None'}</td>
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
