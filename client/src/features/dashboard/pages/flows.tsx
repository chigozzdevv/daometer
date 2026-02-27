import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/app/providers/auth-provider';
import { getDaos, getFlows, type DaoItem, type FlowItem } from '@/features/dashboard/api/api';
import { FlowEditor } from '@/features/dashboard/components/flow-editor';
import { DashboardShell } from '@/features/dashboard/components/shell';
import { DaoSelect } from '@/features/dashboard/components/dao-select';
import { EmptyState, ErrorState, LoadingState } from '@/features/dashboard/components/state';

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

    return () => {
      isMounted = false;
    };
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

  useEffect(() => {
    void loadFlows();
  }, [loadFlows]);

  const isLoading = isLoadingDaos || isLoadingFlows;

  return (
    <DashboardShell
      title="Flows"
      description="Step-by-step builder: pick DAO, build the flow diagram, compile risk, then publish."
    >
      <article className="flow-step-card">
        <header className="flow-step-head">
          <span className="flow-step-index">Context</span>
          <div>
            <h2>Select DAO Workspace</h2>
            <p>Everything below applies to the selected DAO only.</p>
          </div>
        </header>

        <DaoSelect daos={daos} selectedDaoId={selectedDaoId || null} onSelect={setSelectedDaoId} />
      </article>

      {isLoading ? <LoadingState message="Loading flows..." /> : null}
      {!isLoading && error ? <ErrorState message={error} /> : null}
      {!isLoading && !error && !selectedDaoId ? <EmptyState message="Select a DAO to work with flows." /> : null}
      {!session?.accessToken && !isLoading ? <ErrorState message="You must be signed in to edit and publish flows." /> : null}

      {!isLoading && !error && selectedDaoId && session?.accessToken ? (
        <FlowEditor
          accessToken={session.accessToken}
          daos={daos}
          selectedDaoId={selectedDaoId}
          flows={flows}
          onFlowSaved={() => {
            void loadFlows();
          }}
          onFlowPublished={() => {
            void loadFlows();
          }}
        />
      ) : null}
    </DashboardShell>
  );
};
