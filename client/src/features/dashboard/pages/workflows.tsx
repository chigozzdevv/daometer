import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/providers/auth-provider';
import {
  createWorkflow,
  getAuthProfile,
  getDaos,
  getFlows,
  getWorkflows,
  updateWorkflow,
  type DaoItem,
  type FlowItem,
  type WorkflowActionType,
  type WorkflowItem,
  type WorkflowProposalState,
  type WorkflowTriggerType,
} from '@/features/dashboard/api/api';
import { DaoSelect } from '@/features/dashboard/components/dao-select';
import { DashboardShell } from '@/features/dashboard/components/shell';
import { EmptyState, ErrorState, LoadingState } from '@/features/dashboard/components/state';
import { ApiRequestError } from '@/shared/lib/api-client';

const triggerOptions: Array<{ value: WorkflowTriggerType; label: string }> = [
  { value: 'proposal-state-changed', label: 'Proposal state changed' },
  { value: 'voting-ends-in', label: 'Voting ends in' },
  { value: 'hold-up-expires-in', label: 'Hold-up expires in' },
];

const proposalStateOptions: WorkflowProposalState[] = [
  'draft',
  'voting',
  'succeeded',
  'defeated',
  'cancelled',
  'executed',
  'execution-error',
];

const actionOptionMap: Array<{ value: WorkflowActionType; label: string; requiresConfig?: boolean }> = [
  { value: 'send-email', label: 'Send email', requiresConfig: true },
  { value: 'enqueue-execution', label: 'Enqueue execution' },
  { value: 'execute-now', label: 'Execute now' },
  { value: 'set-manual-approval', label: 'Require manual approval', requiresConfig: true },
];

export const DashboardWorkflowsPage = (): JSX.Element => {
  const { session } = useAuth();
  const [allDaos, setAllDaos] = useState<DaoItem[]>([]);
  const [selectedDaoId, setSelectedDaoId] = useState<string | null>(null);
  const [flows, setFlows] = useState<FlowItem[]>([]);
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [isLoadingDaos, setIsLoadingDaos] = useState(true);
  const [isLoadingFlows, setIsLoadingFlows] = useState(true);
  const [isLoadingWorkflows, setIsLoadingWorkflows] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isTogglingRuleId, setIsTogglingRuleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [ruleName, setRuleName] = useState('');
  const [ruleDescription, setRuleDescription] = useState('');
  const [triggerType, setTriggerType] = useState<WorkflowTriggerType>('proposal-state-changed');
  const [triggerState, setTriggerState] = useState<WorkflowProposalState>('voting');
  const [offsetMinutes, setOffsetMinutes] = useState('60');
  const [selectedActions, setSelectedActions] = useState<WorkflowActionType[]>(['enqueue-execution']);
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('Proposal update: {{proposal.title}}');
  const [emailBody, setEmailBody] = useState(
    'State: {{proposal.state}}\nVoting ends: {{proposal.votingEndsAt}}\nDAO: {{daoId}}',
  );

  useEffect(() => {
    let isMounted = true;

    const loadManagedDaos = async (): Promise<void> => {
      if (!session?.accessToken) {
        setError('Sign in to load workflows.');
        setIsLoadingDaos(false);
        setIsLoadingFlows(false);
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
          setSelectedFlowId(null);
          setFlows([]);
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
      setFlows([]);
      setSelectedFlowId(null);
      setIsLoadingFlows(false);
      return;
    }

    let isMounted = true;

    const loadFlows = async (): Promise<void> => {
      setIsLoadingFlows(true);
      setError(null);

      try {
        const loaded = await getFlows({ daoId: selectedDaoId, limit: 100 });

        if (!isMounted) {
          return;
        }

        setFlows(loaded);
        setSelectedFlowId((current) => (current && loaded.some((flow) => flow.id === current) ? current : loaded[0]?.id ?? null));
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : 'Unable to load flows');
      } finally {
        if (isMounted) {
          setIsLoadingFlows(false);
        }
      }
    };

    void loadFlows();

    return () => {
      isMounted = false;
    };
  }, [selectedDaoId, session?.accessToken]);

  useEffect(() => {
    if (!session?.accessToken || !selectedFlowId) {
      setWorkflows([]);
      setIsLoadingWorkflows(false);
      return;
    }

    let isMounted = true;

    const loadWorkflows = async (): Promise<void> => {
      setIsLoadingWorkflows(true);
      setError(null);

      try {
        const rules = await getWorkflows({ flowId: selectedFlowId }, session.accessToken, { limit: 100 });

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
  }, [selectedFlowId, session?.accessToken]);

  const enabledCount = useMemo(() => workflows.filter((workflow) => workflow.enabled).length, [workflows]);
  const isLoading = isLoadingDaos || isLoadingFlows || isLoadingWorkflows;

  const toggleSelectedAction = (action: WorkflowActionType): void => {
    setSelectedActions((current) =>
      current.includes(action) ? current.filter((item) => item !== action) : [...current, action],
    );
  };

  const handleCreateRule = async (): Promise<void> => {
    setError(null);
    setSuccess(null);

    if (!session?.accessToken) {
      setError('Sign in to create workflow rules.');
      return;
    }

    if (!selectedFlowId) {
      setError('Select a flow first.');
      return;
    }

    if (ruleName.trim().length < 2) {
      setError('Rule name must be at least 2 characters.');
      return;
    }

    if (selectedActions.length === 0) {
      setError('Select at least one action.');
      return;
    }

    const parsedOffset = Number(offsetMinutes.trim());

    if (triggerType !== 'proposal-state-changed' && (!Number.isFinite(parsedOffset) || parsedOffset <= 0)) {
      setError('Offset minutes must be greater than 0 for time-based triggers.');
      return;
    }

    if (selectedActions.includes('send-email')) {
      const recipients = emailTo
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

      if (recipients.length === 0) {
        setError('At least one email recipient is required for send-email action.');
        return;
      }
    }

    const onTrueActions = selectedActions.map((action) => {
      if (action === 'send-email') {
        return {
          type: action,
          enabled: true,
          config: {
            to: emailTo
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean),
            subject: emailSubject.trim() || 'DAO workflow update: {{proposal.title}}',
            body: emailBody.trim() || 'Proposal "{{proposal.title}}" changed state: {{proposal.state}}',
          },
        };
      }

      if (action === 'set-manual-approval') {
        return {
          type: action,
          enabled: true,
          config: {
            required: true,
            note: 'Manual approval required by workflow rule',
          },
        };
      }

      return {
        type: action,
        enabled: true,
        config: {},
      };
    });

    setIsCreating(true);

    try {
      const created = await createWorkflow(
        {
          flowId: selectedFlowId,
          name: ruleName.trim(),
          description: ruleDescription.trim() || undefined,
          enabled: true,
          trigger: {
            type: triggerType,
            states: triggerType === 'proposal-state-changed' ? [triggerState] : [],
            offsetMinutes: triggerType === 'proposal-state-changed' ? 0 : Math.round(parsedOffset),
          },
          actions: {
            onTrue: onTrueActions,
            onFalse: [],
          },
        },
        session.accessToken,
      );

      setWorkflows((current) => [created, ...current]);
      setRuleName('');
      setRuleDescription('');
      setTriggerType('proposal-state-changed');
      setTriggerState('voting');
      setOffsetMinutes('60');
      setSelectedActions(['enqueue-execution']);
      setEmailTo('');
      setEmailSubject('Proposal update: {{proposal.title}}');
      setEmailBody('State: {{proposal.state}}\nVoting ends: {{proposal.votingEndsAt}}\nDAO: {{daoId}}');
      setSuccess('Workflow rule created.');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create workflow rule');
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggleRule = async (workflow: WorkflowItem): Promise<void> => {
    if (!session?.accessToken) {
      setError('Sign in to update workflow rules.');
      return;
    }

    setIsTogglingRuleId(workflow.id);
    setError(null);
    setSuccess(null);

    try {
      const updated = await updateWorkflow(workflow.id, { enabled: !workflow.enabled }, session.accessToken);
      setWorkflows((current) => current.map((item) => (item.id === workflow.id ? updated : item)));
      setSuccess(`Rule "${updated.name}" ${updated.enabled ? 'enabled' : 'disabled'}.`);
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : 'Unable to update workflow rule');
    } finally {
      setIsTogglingRuleId(null);
    }
  };

  return (
    <DashboardShell title="Workflows" description="Create rule-based automations for proposal reminders, approvals, and execution.">
      <DaoSelect daos={allDaos} selectedDaoId={selectedDaoId} onSelect={setSelectedDaoId} />
      {allDaos.length > 0 ? (
        <label className="input-label inline-select">
          <span>Flow</span>
          <select
            className="select-input"
            value={selectedFlowId ?? ''}
            onChange={(event) => setSelectedFlowId(event.target.value || null)}
            disabled={flows.length === 0}
          >
            {flows.length === 0 ? <option value="">No flows</option> : null}
            {flows.map((flow) => (
              <option key={flow.id} value={flow.id}>
                {flow.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {success ? <p className="success-text">{success}</p> : null}
      {isLoading ? <LoadingState message="Loading workflows..." /> : null}
      {!isLoading && error ? <ErrorState message={error} /> : null}
      {!isLoading && !error && allDaos.length === 0 ? (
        <EmptyState message="You are not managing any DAO yet, so no workflows are available." />
      ) : null}

      {!isLoading && !error && allDaos.length > 0 && selectedFlowId ? (
        <article className="flow-step-card">
          <header className="flow-step-head">
            <span className="flow-step-index">Rule</span>
            <div>
              <h2>Create Workflow Rule</h2>
              <p>Rules run in the worker loop and apply actions when triggers match.</p>
            </div>
          </header>

          <div className="form-grid two-col">
            <label className="input-label">
              Name
              <input
                className="text-input"
                value={ruleName}
                onChange={(event) => setRuleName(event.target.value)}
                minLength={2}
                maxLength={120}
              />
            </label>

            <label className="input-label">
              Trigger
              <select
                className="select-input"
                value={triggerType}
                onChange={(event) => setTriggerType(event.target.value as WorkflowTriggerType)}
              >
                {triggerOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {triggerType === 'proposal-state-changed' ? (
              <label className="input-label">
                Proposal state
                <select
                  className="select-input"
                  value={triggerState}
                  onChange={(event) => setTriggerState(event.target.value as WorkflowProposalState)}
                >
                  {proposalStateOptions.map((state) => (
                    <option key={state} value={state}>
                      {state}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="input-label">
                Offset minutes
                <input
                  className="text-input"
                  type="number"
                  min={1}
                  max={43200}
                  value={offsetMinutes}
                  onChange={(event) => setOffsetMinutes(event.target.value)}
                />
              </label>
            )}

            <label className="input-label">
              Description (optional)
              <input
                className="text-input"
                value={ruleDescription}
                onChange={(event) => setRuleDescription(event.target.value)}
                maxLength={2000}
              />
            </label>
          </div>

          <div className="form-grid">
            <p className="subheading">Actions On Match</p>
            <div className="button-row">
              {actionOptionMap.map((option) => (
                <label key={option.value} className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={selectedActions.includes(option.value)}
                    onChange={() => toggleSelectedAction(option.value)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>

          {selectedActions.includes('send-email') ? (
            <div className="form-grid two-col">
              <label className="input-label">
                Email recipients (comma separated)
                <input
                  className="text-input"
                  value={emailTo}
                  onChange={(event) => setEmailTo(event.target.value)}
                  placeholder="ops@example.com, team@example.com"
                />
              </label>
              <label className="input-label">
                Email subject
                <input
                  className="text-input"
                  value={emailSubject}
                  onChange={(event) => setEmailSubject(event.target.value)}
                />
              </label>
              <label className="input-label">
                Email body
                <textarea
                  className="text-input textarea-input"
                  rows={4}
                  value={emailBody}
                  onChange={(event) => setEmailBody(event.target.value)}
                />
              </label>
            </div>
          ) : null}

          <div className="button-row">
            <button type="button" className="primary-button" onClick={() => void handleCreateRule()} disabled={isCreating}>
              {isCreating ? 'Creating...' : 'Create Rule'}
            </button>
          </div>
        </article>
      ) : null}

      {!isLoading && !error && allDaos.length > 0 && flows.length === 0 ? (
        <EmptyState message="No flows found for this DAO. Create a flow first." />
      ) : null}

      {!isLoading && !error && workflows.length === 0 && allDaos.length > 0 && selectedFlowId ? (
        <EmptyState message="No workflow rules found for the selected flow." />
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
                  <th>Action</th>
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
                    <td>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => void handleToggleRule(workflow)}
                        disabled={isTogglingRuleId === workflow.id}
                      >
                        {isTogglingRuleId === workflow.id
                          ? 'Updating...'
                          : workflow.enabled
                            ? 'Disable'
                            : 'Enable'}
                      </button>
                    </td>
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
