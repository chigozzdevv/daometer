import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/providers/auth-provider';
import {
  getAuthProfile,
  getDaos,
  getWorkflowEvents,
  getWorkflows,
  type DaoItem,
  type WorkflowEventItem,
  type WorkflowItem,
} from '@/features/dashboard/api/api';
import { DaoSelect } from '@/features/dashboard/components/dao-select';
import { DashboardShell } from '@/features/dashboard/components/shell';
import { EmptyState, ErrorState, LoadingState } from '@/features/dashboard/components/state';
import { formatDateTime } from '@/features/dashboard/lib/format';
import { ApiRequestError } from '@/shared/lib/api-client';

const resultChip = (results: WorkflowEventItem['actionResults']): JSX.Element => {
  if (results.some((r) => r.status === 'failed'))
    return <span className="status-chip status-chip--red">Failed</span>;
  if (results.some((r) => r.status === 'success'))
    return <span className="status-chip status-chip--green">Success</span>;
  return <span className="status-chip status-chip--gray">Skipped</span>;
};

export const DashboardNotificationsPage = (): JSX.Element => {
  const { session } = useAuth();
  const [managedDaos, setManagedDaos] = useState<DaoItem[]>([]);
  const [selectedDaoId, setSelectedDaoId] = useState<string | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [events, setEvents] = useState<WorkflowEventItem[]>([]);
  const [isLoadingDaos, setIsLoadingDaos] = useState(true);
  const [isLoadingWorkflows, setIsLoadingWorkflows] = useState(true);
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadDaos = async (): Promise<void> => {
      if (!session?.accessToken) {
        setError('Sign in to load notification history.');
        setIsLoadingDaos(false);
        setIsLoadingWorkflows(false);
        setIsLoadingEvents(false);
        return;
      }

      setIsLoadingDaos(true);
      setError(null);

      try {
        const [profile, daos] = await Promise.all([getAuthProfile(session.accessToken), getDaos({ limit: 100 })]);
        const ownDaos = daos.filter((dao) => dao.createdBy === profile.id);
        if (!isMounted) return;

        setManagedDaos(ownDaos);

        if (ownDaos.length === 0) {
          setSelectedDaoId(null); setWorkflows([]); setSelectedWorkflowId(null); setEvents([]);
          return;
        }

        setSelectedDaoId(ownDaos[0].id);
      } catch (loadError) {
        if (!isMounted) return;

        if (loadError instanceof ApiRequestError && loadError.status === 403) {
          setError('You are not allowed to read workflows for this DAO.');
        } else {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load workflows');
        }
      } finally {
        if (isMounted) setIsLoadingDaos(false);
      }
    };

    void loadDaos();
    return () => { isMounted = false; };
  }, [session?.accessToken]);

  useEffect(() => {
    if (!selectedDaoId || !session?.accessToken) {
      setWorkflows([]); setSelectedWorkflowId(null); setIsLoadingWorkflows(false);
      return;
    }

    let isMounted = true;

    const loadWorkflows = async (): Promise<void> => {
      setIsLoadingWorkflows(true);
      setError(null);

      try {
        const loaded = await getWorkflows(selectedDaoId, session.accessToken, { limit: 100 });
        if (!isMounted) return;
        setWorkflows(loaded);
        setSelectedWorkflowId(loaded[0]?.id ?? null);
      } catch (loadError) {
        if (!isMounted) return;
        if (loadError instanceof ApiRequestError && loadError.status === 403) {
          setError('You are not allowed to read workflows for this DAO.');
        } else {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load workflows');
        }
      } finally {
        if (isMounted) setIsLoadingWorkflows(false);
      }
    };

    void loadWorkflows();
    return () => { isMounted = false; };
  }, [selectedDaoId, session?.accessToken]);

  useEffect(() => {
    if (!selectedWorkflowId || !session?.accessToken) {
      setEvents([]); setIsLoadingEvents(false);
      return;
    }

    let isMounted = true;

    const loadEvents = async (): Promise<void> => {
      setIsLoadingEvents(true);
      setError(null);

      try {
        const items = await getWorkflowEvents(selectedWorkflowId, session.accessToken, { limit: 100 });
        if (isMounted) setEvents(items);
      } catch (loadError) {
        if (!isMounted) return;
        if (loadError instanceof ApiRequestError && loadError.status === 403) {
          setError('You are not allowed to read workflow events for this rule.');
        } else {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load workflow events');
        }
      } finally {
        if (isMounted) setIsLoadingEvents(false);
      }
    };

    void loadEvents();
    return () => { isMounted = false; };
  }, [selectedWorkflowId, session?.accessToken]);

  const successfulActions = useMemo(
    () => events.flatMap((event) => event.actionResults).filter((r) => r.status === 'success').length,
    [events],
  );
  const isLoading = isLoadingDaos || isLoadingWorkflows || isLoadingEvents;

  return (
    <DashboardShell title="Notifications" description="Workflow event history and action delivery outcomes from real evaluations.">
      <DaoSelect daos={managedDaos} selectedDaoId={selectedDaoId} onSelect={setSelectedDaoId} />

      {workflows.length > 0 ? (
        <label className="select-field">
          <span>Workflow</span>
          <select value={selectedWorkflowId ?? workflows[0]?.id} onChange={(event) => setSelectedWorkflowId(event.target.value)} className="select-input">
            {workflows.map((workflow) => (
              <option key={workflow.id} value={workflow.id}>{workflow.name}</option>
            ))}
          </select>
        </label>
      ) : null}

      {isLoading ? <LoadingState message="Loading workflow events..." /> : null}
      {!isLoading && error ? <ErrorState message={error} /> : null}
      {!isLoading && !error && managedDaos.length === 0 ? (
        <EmptyState message="You do not manage any DAO yet, so there are no notification events to display." />
      ) : null}
      {!isLoading && !error && managedDaos.length > 0 && workflows.length === 0 ? (
        <EmptyState message="No workflow rules exist for this DAO." />
      ) : null}
      {!isLoading && !error && workflows.length > 0 && events.length === 0 ? (
        <EmptyState message="No workflow events have fired yet for this rule." />
      ) : null}

      {!isLoading && !error && events.length > 0 ? (
        <>
          <div className="metric-grid">
            <article className="metric-card"><p>Events logged</p><h3>{events.length}</h3></article>
            <article className={`metric-card${successfulActions > 0 ? ' metric-card-accent' : ''}`}>
              <p>Successful actions</p><h3>{successfulActions}</h3>
            </article>
          </div>

          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fired at</th>
                  <th>Trigger</th>
                  <th>Matched</th>
                  <th>Actions</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td>{formatDateTime(event.firedAt)}</td>
                    <td><span className="status-chip status-chip--gray">{event.triggerType}</span></td>
                    <td>
                      <span className={`status-chip ${event.matched ? 'status-chip--green' : 'status-chip--gray'}`}>
                        {event.matched ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td>{event.actionResults.length}</td>
                    <td>{resultChip(event.actionResults)}</td>
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
