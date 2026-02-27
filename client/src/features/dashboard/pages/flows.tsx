import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/providers/auth-provider';
import { getDaos, getFlows, type DaoItem, type FlowItem } from '@/features/dashboard/api/api';
import { FlowEditor } from '@/features/dashboard/components/flow-editor';
import { DashboardShell } from '@/features/dashboard/components/shell';
import { EmptyState, ErrorState, LoadingState } from '@/features/dashboard/components/state';
import { formatDateTime } from '@/features/dashboard/lib/format';

const statusChip = (status: FlowItem['status']): JSX.Element => {
  const map = { published: 'status-chip--green', draft: 'status-chip--yellow', archived: 'status-chip--gray' };
  return <span className={`status-chip ${map[status]}`}>{status}</span>;
};

const riskChip = (level: 'safe' | 'warning' | 'critical', score: number): JSX.Element => {
  const map = { safe: 'status-chip--green', warning: 'status-chip--yellow', critical: 'status-chip--red' };
  return <span className={`status-chip ${map[level]}`}>{score} · {level}</span>;
};

export const DashboardFlowsPage = (): JSX.Element => {
  const { session } = useAuth();
  const [daos, setDaos] = useState<DaoItem[]>([]);
  const [selectedDaoId, setSelectedDaoId] = useState<string>('');
  const [flows, setFlows] = useState<FlowItem[]>([]);
  const [isLoadingDaos, setIsLoadingDaos] = useState(true);
  const [isLoadingFlows, setIsLoadingFlows] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadDaos = async (): Promise<void> => {
      setIsLoadingDaos(true);
      try {
        const items = await getDaos({ limit: 100 });
        if (isMounted) {
          setDaos(items);
          setSelectedDaoId((current) => current || items[0]?.id || '');
        }
      } catch (loadError) {
        if (isMounted) {
          setDaos([]);
          setError(loadError instanceof Error ? loadError.message : 'Unable to load DAOs');
        }
      } finally {
        if (isMounted) setIsLoadingDaos(false);
      }
    };

    void loadDaos();
    return () => { isMounted = false; };
  }, []);

  const loadFlows = useCallback(async (): Promise<void> => {
    if (!selectedDaoId) {
      setFlows([]);
      setIsLoadingFlows(false);
      return;
    }

    setIsLoadingFlows(true);
    setError(null);

    try {
      const items = await getFlows({ limit: 100, daoId: selectedDaoId });
      setFlows(items);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load flows');
    } finally {
      setIsLoadingFlows(false);
    }
  }, [selectedDaoId]);

  useEffect(() => { void loadFlows(); }, [loadFlows]);

  const selectedDaoName = useMemo(
    () => daos.find((dao) => dao.id === selectedDaoId)?.name ?? 'DAO',
    [daos, selectedDaoId],
  );
  const isLoading = isLoadingDaos || isLoadingFlows;

  return (
    <DashboardShell title="Flows" description="Full flow lifecycle: create/update blocks, compile risk, and publish proposals.">
      <label className="select-field">
        <span>DAO</span>
        <select className="select-input" value={selectedDaoId} onChange={(event) => setSelectedDaoId(event.target.value)}>
          <option value="" disabled>Select DAO</option>
          {daos.map((dao) => (
            <option key={dao.id} value={dao.id}>{dao.name}</option>
          ))}
        </select>
      </label>

      {isLoading ? <LoadingState message="Loading flows..." /> : null}
      {!isLoading && error ? <ErrorState message={error} /> : null}
      {!isLoading && !error && !selectedDaoId ? <EmptyState message="Select a DAO to work with flows." /> : null}

      {!isLoading && !error && selectedDaoId && session?.accessToken ? (
        <FlowEditor
          accessToken={session.accessToken}
          daos={daos}
          selectedDaoId={selectedDaoId}
          flows={flows}
          onFlowSaved={() => { void loadFlows(); }}
          onFlowPublished={() => { void loadFlows(); }}
        />
      ) : null}

      {!isLoading && !error && selectedDaoId && flows.length === 0 ? (
        <EmptyState message="No flows found for this DAO yet." />
      ) : null}

      {!isLoading && !error && flows.length > 0 ? (
        <div className="data-grid">
          {flows.map((flow) => (
            <article key={flow.id} className="data-card">
              <div className="data-card-header">
                <h3>{flow.name}</h3>
                {statusChip(flow.status)}
              </div>
              <dl>
                <div><dt>Version</dt><dd>v{flow.version}</dd></div>
                <div><dt>DAO</dt><dd>{selectedDaoName}</dd></div>
                <div><dt>Tags</dt><dd>{flow.tags?.length ? flow.tags.join(', ') : '—'}</dd></div>
                <div>
                  <dt>Compiled risk</dt>
                  <dd>{flow.latestCompilation ? riskChip(flow.latestCompilation.riskLevel, flow.latestCompilation.riskScore) : <span className="status-chip status-chip--gray">Not compiled</span>}</dd>
                </div>
                <div><dt>Instructions</dt><dd>{flow.latestCompilation?.instructionCount ?? 0}</dd></div>
                <div><dt>Updated</dt><dd>{formatDateTime(flow.updatedAt)}</dd></div>
              </dl>
            </article>
          ))}
        </div>
      ) : null}
    </DashboardShell>
  );
};
