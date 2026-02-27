import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/providers/auth-provider';
import { createFlow, getDaos, getFlows, type DaoItem, type FlowGraph, type FlowItem } from '@/features/dashboard/api/api';
import { FlowEditor } from '@/features/dashboard/components/flow-editor';
import { DashboardShell } from '@/features/dashboard/components/shell';
import { DaoSelect } from '@/features/dashboard/components/dao-select';
import { ErrorState, LoadingState } from '@/features/dashboard/components/state';

const makeBlockId = (): string => `block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const createDefaultFlowDraft = (): { blocks: Record<string, unknown>[]; graph: FlowGraph } => {
  const blockId = makeBlockId();

  return {
    blocks: [
      {
        id: blockId,
        type: 'transfer-sol',
        label: 'Treasury transfer',
        fromGovernance: '',
        toWallet: '',
        lamports: 1_000_000,
      },
    ],
    graph: {
      nodes: [{ id: blockId, x: 60, y: 60 }],
      edges: [],
    },
  };
};

type FlowPageMode = 'idle' | 'details' | 'builder';

export const DashboardFlowsPage = (): JSX.Element => {
  const { session } = useAuth();
  const [daos, setDaos] = useState<DaoItem[]>([]);
  const [flows, setFlows] = useState<FlowItem[]>([]);
  const [isLoadingDaos, setIsLoadingDaos] = useState(true);
  const [isLoadingFlows, setIsLoadingFlows] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<FlowPageMode>('idle');
  const [activeFlowId, setActiveFlowId] = useState<string | null>(null);

  const [detailsDaoId, setDetailsDaoId] = useState<string>('');
  const [detailsName, setDetailsName] = useState('');
  const [detailsDescription, setDetailsDescription] = useState('');
  const [isCreatingFlow, setIsCreatingFlow] = useState(false);

  const [openExistingFlowId, setOpenExistingFlowId] = useState('');

  const loadDaos = useCallback(async (): Promise<void> => {
    setIsLoadingDaos(true);

    try {
      const items = await getDaos({ limit: 100 });
      setDaos(items);
      setDetailsDaoId((current) => current || items[0]?.id || '');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load DAOs');
      setDaos([]);
    } finally {
      setIsLoadingDaos(false);
    }
  }, []);

  const loadFlows = useCallback(async (): Promise<void> => {
    setIsLoadingFlows(true);

    try {
      const items = await getFlows({ limit: 100 });
      setFlows(items);
      setOpenExistingFlowId((current) => current || items[0]?.id || '');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load flows');
      setFlows([]);
    } finally {
      setIsLoadingFlows(false);
    }
  }, []);

  useEffect(() => {
    void loadDaos();
    void loadFlows();
  }, [loadDaos, loadFlows]);

  const isLoading = isLoadingDaos || isLoadingFlows;

  const activeFlow = useMemo(
    () => flows.find((flow) => flow.id === activeFlowId) ?? null,
    [flows, activeFlowId],
  );

  const handleCreateFlow = async (): Promise<void> => {
    setError(null);

    if (!session?.accessToken) {
      setError('You must be signed in to create flows.');
      return;
    }

    if (!detailsDaoId) {
      setError('Select a DAO.');
      return;
    }

    if (detailsName.trim().length < 3) {
      setError('Project name must be at least 3 characters.');
      return;
    }

    setIsCreatingFlow(true);

    try {
      const draft = createDefaultFlowDraft();
      const created = await createFlow(
        {
          daoId: detailsDaoId,
          name: detailsName.trim(),
          description: detailsDescription.trim() || undefined,
          blocks: draft.blocks,
          graph: draft.graph,
        },
        session.accessToken,
      );

      await loadFlows();
      setActiveFlowId(created.id);
      setMode('builder');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create flow');
    } finally {
      setIsCreatingFlow(false);
    }
  };

  return (
    <DashboardShell
      title="Flows"
      description="Create flow details first, then build diagram, compile, and publish."
    >
      {isLoading ? <LoadingState message="Loading flows..." /> : null}
      {!isLoading && error ? <ErrorState message={error} /> : null}

      {!isLoading && !error && mode === 'idle' ? (
        <article className="flow-step-card">
          <header className="editor-header">
            <div>
              <h2>No Flow Found</h2>
              <p>Create a new flow.</p>
            </div>
          </header>

          <div className="button-row">
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                setDetailsName('');
                setDetailsDescription('');
                setMode('details');
              }}
            >
              Create Flow
            </button>
          </div>

          {flows.length > 0 ? (
            <div className="form-grid two-col">
              <label className="input-label">
                Open existing flow
                <select
                  className="select-input"
                  value={openExistingFlowId}
                  onChange={(event) => setOpenExistingFlowId(event.target.value)}
                >
                  {flows.map((flow) => (
                    <option key={flow.id} value={flow.id}>
                      {flow.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flow-open-action">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    if (!openExistingFlowId) {
                      return;
                    }

                    setActiveFlowId(openExistingFlowId);
                    setMode('builder');
                  }}
                >
                  Open Flow
                </button>
              </div>
            </div>
          ) : null}
        </article>
      ) : null}

      {!isLoading && !error && mode === 'details' ? (
        <article className="flow-step-card">
          <header className="flow-step-head">
            <span className="flow-step-index">Step 1</span>
            <div>
              <h2>Flow Details</h2>
              <p>Select DAO, enter project name and description, then continue.</p>
            </div>
          </header>

          <DaoSelect daos={daos} selectedDaoId={detailsDaoId || null} onSelect={setDetailsDaoId} label="DAO" />

          <label className="input-label">
            Project name
            <input
              className="text-input"
              value={detailsName}
              onChange={(event) => setDetailsName(event.target.value)}
              minLength={3}
              maxLength={120}
              required
            />
          </label>

          <label className="input-label">
            Description
            <textarea
              className="text-input textarea-input"
              value={detailsDescription}
              onChange={(event) => setDetailsDescription(event.target.value)}
              rows={4}
              maxLength={2000}
            />
          </label>

          <div className="button-row">
            <button type="button" className="secondary-button" onClick={() => setMode('idle')}>
              Back
            </button>
            <button type="button" className="primary-button" onClick={() => void handleCreateFlow()} disabled={isCreatingFlow}>
              {isCreatingFlow ? 'Creating...' : 'Next'}
            </button>
          </div>
        </article>
      ) : null}

      {!isLoading && !error && mode === 'builder' && activeFlowId && !session?.accessToken ? (
        <ErrorState message="You must be signed in to continue editing this flow." />
      ) : null}

      {!isLoading && !error && mode === 'builder' && activeFlowId && session?.accessToken ? (
        <>
          <article className="flow-step-card">
            <header className="flow-step-head">
              <span className="flow-step-index">Step 2</span>
              <div>
                <h2>Flow Builder</h2>
                <p>{activeFlow ? `Editing ${activeFlow.name}` : 'Build your flow graph'}</p>
              </div>
            </header>

            <div className="button-row">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setActiveFlowId(null);
                  setMode('idle');
                }}
              >
                Close Builder
              </button>
            </div>
          </article>

          <FlowEditor
            accessToken={session.accessToken}
            flowId={activeFlowId}
            onFlowSaved={() => {
              void loadFlows();
            }}
            onFlowPublished={() => {
              void loadFlows();
            }}
          />
        </>
      ) : null}
    </DashboardShell>
  );
};
