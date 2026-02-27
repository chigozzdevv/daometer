import { useMemo, useState } from 'react';
import {
  compileFlowById,
  compileInlineFlow,
  createFlow,
  getFlowById,
  publishFlow,
  type DaoItem,
  type FlowCompilationResult,
  type FlowItem,
  type FlowProposalDefaults,
  type PublishFlowResult,
  updateFlow,
} from '@/features/dashboard/api/api';
import { formatDateTime } from '@/features/dashboard/lib/format';

const newFlowKey = '__new-flow';
const defaultBlocks = [
  {
    id: 'block-1',
    type: 'transfer-sol',
    label: 'Treasury transfer',
    fromGovernance: '',
    toWallet: '',
    lamports: 1_000_000,
  },
];

const defaultProposalDefaults: FlowProposalDefaults = {
  titlePrefix: 'Proposal',
  voteScope: 'community',
  state: 'voting',
  holdUpSeconds: 0,
  votingDurationHours: 72,
  autoExecute: true,
  executeAfterHoldUp: true,
  maxRiskScore: 70,
};

const toPrettyJson = (value: unknown): string => JSON.stringify(value, null, 2);

const parseJson = <TValue,>(raw: string, label: string): TValue => {
  try {
    return JSON.parse(raw) as TValue;
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }
};

const parseInteger = (value: string, label: string): number => {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a valid integer`);
  }

  return parsed;
};

const toTags = (value: string): string[] =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

type FlowEditorProps = {
  accessToken: string;
  selectedDaoId: string;
  daos: DaoItem[];
  flows: FlowItem[];
  onFlowSaved: (flow: FlowItem) => void;
  onFlowPublished: (result: PublishFlowResult) => void;
};

export const FlowEditor = ({
  accessToken,
  selectedDaoId,
  daos,
  flows,
  onFlowSaved,
  onFlowPublished,
}: FlowEditorProps): JSX.Element => {
  const [activeFlowId, setActiveFlowId] = useState<string>(newFlowKey);
  const [isLoadingFlow, setIsLoadingFlow] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCompiling, setIsCompiling] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [status, setStatus] = useState<'draft' | 'published' | 'archived'>('draft');
  const [blocksJson, setBlocksJson] = useState(toPrettyJson(defaultBlocks));

  const [titlePrefix, setTitlePrefix] = useState(defaultProposalDefaults.titlePrefix);
  const [proposalVoteScope, setProposalVoteScope] = useState<'community' | 'council'>(defaultProposalDefaults.voteScope);
  const [proposalState, setProposalState] = useState<'draft' | 'voting'>(defaultProposalDefaults.state);
  const [holdUpSeconds, setHoldUpSeconds] = useState(defaultProposalDefaults.holdUpSeconds.toString());
  const [votingDurationHours, setVotingDurationHours] = useState(defaultProposalDefaults.votingDurationHours.toString());
  const [autoExecute, setAutoExecute] = useState(defaultProposalDefaults.autoExecute);
  const [executeAfterHoldUp, setExecuteAfterHoldUp] = useState(defaultProposalDefaults.executeAfterHoldUp);
  const [maxRiskScore, setMaxRiskScore] = useState(defaultProposalDefaults.maxRiskScore.toString());

  const [compileContextJson, setCompileContextJson] = useState('{}');
  const [compileResult, setCompileResult] = useState<FlowCompilationResult | null>(null);

  const [publishTitle, setPublishTitle] = useState('');
  const [publishDescription, setPublishDescription] = useState('');
  const [publishVoteScope, setPublishVoteScope] = useState<'community' | 'council'>('community');
  const [publishState, setPublishState] = useState<'draft' | 'voting'>('voting');
  const [publishHoldUpSeconds, setPublishHoldUpSeconds] = useState('0');
  const [publishVotingDurationHours, setPublishVotingDurationHours] = useState('72');
  const [publishAutoExecute, setPublishAutoExecute] = useState(true);
  const [publishExecuteAfterHoldUp, setPublishExecuteAfterHoldUp] = useState(true);
  const [publishMaxRiskScore, setPublishMaxRiskScore] = useState('70');

  const [onchainCreateEnabled, setOnchainCreateEnabled] = useState(false);
  const [onchainGovernanceProgramId, setOnchainGovernanceProgramId] = useState('');
  const [onchainProgramVersion, setOnchainProgramVersion] = useState('3');
  const [onchainRealmAddress, setOnchainRealmAddress] = useState('');
  const [onchainGovernanceAddress, setOnchainGovernanceAddress] = useState('');
  const [onchainGoverningTokenMint, setOnchainGoverningTokenMint] = useState('');
  const [onchainDescriptionLink, setOnchainDescriptionLink] = useState('');
  const [onchainOptionIndex, setOnchainOptionIndex] = useState('0');
  const [onchainUseDenyOption, setOnchainUseDenyOption] = useState(true);
  const [onchainRpcUrl, setOnchainRpcUrl] = useState('');
  const [onchainSignOff, setOnchainSignOff] = useState(true);
  const [onchainRequireSimulation, setOnchainRequireSimulation] = useState(true);

  const [lastPublishResult, setLastPublishResult] = useState<PublishFlowResult | null>(null);

  const flowOptions = useMemo(
    () => flows.filter((flow) => flow.daoId === selectedDaoId),
    [flows, selectedDaoId],
  );

  const selectedDao = useMemo(() => daos.find((dao) => dao.id === selectedDaoId) ?? null, [daos, selectedDaoId]);

  const resetForNewFlow = (): void => {
    setActiveFlowId(newFlowKey);
    setName('');
    setDescription('');
    setTagsInput('');
    setStatus('draft');
    setBlocksJson(toPrettyJson(defaultBlocks));
    setTitlePrefix(defaultProposalDefaults.titlePrefix);
    setProposalVoteScope(defaultProposalDefaults.voteScope);
    setProposalState(defaultProposalDefaults.state);
    setHoldUpSeconds(defaultProposalDefaults.holdUpSeconds.toString());
    setVotingDurationHours(defaultProposalDefaults.votingDurationHours.toString());
    setAutoExecute(defaultProposalDefaults.autoExecute);
    setExecuteAfterHoldUp(defaultProposalDefaults.executeAfterHoldUp);
    setMaxRiskScore(defaultProposalDefaults.maxRiskScore.toString());
    setCompileResult(null);
    setLastPublishResult(null);
    setSuccess(null);
    setError(null);
  };

  const loadFlowIntoEditor = async (flowId: string): Promise<void> => {
    setIsLoadingFlow(true);
    setError(null);
    setSuccess(null);

    try {
      const flow = await getFlowById(flowId);
      setActiveFlowId(flow.id);
      setName(flow.name);
      setDescription(flow.description ?? '');
      setTagsInput((flow.tags ?? []).join(', '));
      setStatus(flow.status);
      setBlocksJson(toPrettyJson(flow.blocks));
      setTitlePrefix(flow.proposalDefaults.titlePrefix);
      setProposalVoteScope(flow.proposalDefaults.voteScope);
      setProposalState(flow.proposalDefaults.state);
      setHoldUpSeconds(flow.proposalDefaults.holdUpSeconds.toString());
      setVotingDurationHours(flow.proposalDefaults.votingDurationHours.toString());
      setAutoExecute(flow.proposalDefaults.autoExecute);
      setExecuteAfterHoldUp(flow.proposalDefaults.executeAfterHoldUp);
      setMaxRiskScore(flow.proposalDefaults.maxRiskScore.toString());
      setCompileResult(null);
      setLastPublishResult(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load flow');
    } finally {
      setIsLoadingFlow(false);
    }
  };

  const buildFlowPayload = (): {
    name: string;
    description: string;
    tags: string[];
    blocks: Record<string, unknown>[];
    proposalDefaults: FlowProposalDefaults;
  } => {
    const parsedBlocks = parseJson<unknown>(blocksJson, 'Blocks');

    if (!Array.isArray(parsedBlocks) || parsedBlocks.length === 0) {
      throw new Error('Blocks JSON must be a non-empty array');
    }

    const parsedContextBlocks = parsedBlocks as Record<string, unknown>[];

    const payloadName = name.trim();

    if (payloadName.length < 2) {
      throw new Error('Flow name must be at least 2 characters');
    }

    return {
      name: payloadName,
      description: description.trim(),
      tags: toTags(tagsInput),
      blocks: parsedContextBlocks,
      proposalDefaults: {
        titlePrefix: titlePrefix.trim(),
        voteScope: proposalVoteScope,
        state: proposalState,
        holdUpSeconds: parseInteger(holdUpSeconds, 'Hold up seconds'),
        votingDurationHours: parseInteger(votingDurationHours, 'Voting duration hours'),
        autoExecute,
        executeAfterHoldUp,
        maxRiskScore: parseInteger(maxRiskScore, 'Max risk score'),
      },
    };
  };

  const handleSave = async (): Promise<void> => {
    if (!selectedDao) {
      setError('Select a DAO before saving a flow');
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = buildFlowPayload();

      const savedFlow =
        activeFlowId === newFlowKey
          ? await createFlow(
              {
                daoId: selectedDao.id,
                ...payload,
              },
              accessToken,
            )
          : await updateFlow(
              activeFlowId,
              {
                ...payload,
                status,
              },
              accessToken,
            );

      onFlowSaved(savedFlow);
      setActiveFlowId(savedFlow.id);
      setStatus(savedFlow.status);
      setSuccess(activeFlowId === newFlowKey ? 'Flow created successfully.' : 'Flow updated successfully.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save flow');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCompile = async (): Promise<void> => {
    setIsCompiling(true);
    setError(null);
    setSuccess(null);

    try {
      const contextRaw = compileContextJson.trim();
      const context = contextRaw ? parseJson<Record<string, unknown>>(contextRaw, 'Compile context') : {};
      let result: FlowCompilationResult;

      if (activeFlowId === newFlowKey) {
        const payload = buildFlowPayload();
        result = await compileInlineFlow(payload.blocks, context, accessToken);
      } else {
        result = await compileFlowById(activeFlowId, context, accessToken);
      }

      setCompileResult(result);
      setSuccess('Compilation completed.');
    } catch (compileError) {
      setError(compileError instanceof Error ? compileError.message : 'Unable to compile flow');
    } finally {
      setIsCompiling(false);
    }
  };

  const handlePublish = async (): Promise<void> => {
    if (activeFlowId === newFlowKey) {
      setError('Save the flow before publishing it');
      return;
    }

    setIsPublishing(true);
    setError(null);
    setSuccess(null);

    try {
      const contextRaw = compileContextJson.trim();
      const context = contextRaw ? parseJson<Record<string, unknown>>(contextRaw, 'Compile context') : {};

      const result = await publishFlow(
        activeFlowId,
        {
          title: publishTitle.trim() || undefined,
          description: publishDescription.trim() || undefined,
          voteScope: publishVoteScope,
          state: publishState,
          holdUpSeconds: parseInteger(publishHoldUpSeconds, 'Publish hold up seconds'),
          votingDurationHours: parseInteger(publishVotingDurationHours, 'Publish voting duration hours'),
          automation: {
            autoExecute: publishAutoExecute,
            executeAfterHoldUp: publishExecuteAfterHoldUp,
            maxRiskScore: parseInteger(publishMaxRiskScore, 'Publish max risk score'),
          },
          context,
          onchainCreate: onchainCreateEnabled
            ? {
                enabled: true,
                governanceProgramId: onchainGovernanceProgramId.trim() || undefined,
                programVersion: parseInteger(onchainProgramVersion, 'Program version'),
                realmAddress: onchainRealmAddress.trim(),
                governanceAddress: onchainGovernanceAddress.trim(),
                governingTokenMint: onchainGoverningTokenMint.trim(),
                descriptionLink: onchainDescriptionLink.trim() || undefined,
                optionIndex: parseInteger(onchainOptionIndex, 'Option index'),
                useDenyOption: onchainUseDenyOption,
                rpcUrl: onchainRpcUrl.trim() || undefined,
                signOff: onchainSignOff,
                requireSimulation: onchainRequireSimulation,
              }
            : undefined,
        },
        accessToken,
      );

      setLastPublishResult(result);
      onFlowPublished(result);
      onFlowSaved(result.flow);
      setStatus(result.flow.status);
      setCompileResult(result.compilation);
      setSuccess('Flow published and proposal created successfully.');
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : 'Unable to publish flow');
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <section className="editor-grid">
      <article className="editor-card">
        <header className="editor-header">
          <h2>Flow Studio</h2>
          <p>Create, update, compile, and publish a flow with live backend APIs.</p>
        </header>

        <div className="form-grid two-col">
          <label className="input-label">
            Flow
            <select
              className="select-input"
              value={activeFlowId}
              onChange={(event) => {
                const nextValue = event.target.value;

                if (nextValue === newFlowKey) {
                  resetForNewFlow();
                  return;
                }

                void loadFlowIntoEditor(nextValue);
              }}
              disabled={isLoadingFlow || isSaving || isCompiling || isPublishing}
            >
              <option value={newFlowKey}>New flow</option>
              {flowOptions.map((flow) => (
                <option key={flow.id} value={flow.id}>
                  {flow.name} ({flow.status})
                </option>
              ))}
            </select>
          </label>

          <label className="input-label">
            Status
            <select
              className="select-input"
              value={status}
              onChange={(event) => setStatus(event.target.value as 'draft' | 'published' | 'archived')}
              disabled={activeFlowId === newFlowKey}
            >
              <option value="draft">draft</option>
              <option value="published">published</option>
              <option value="archived">archived</option>
            </select>
          </label>
        </div>

        <div className="form-grid two-col">
          <label className="input-label">
            Name
            <input className="text-input" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="input-label">
            Tags (comma-separated)
            <input className="text-input" value={tagsInput} onChange={(event) => setTagsInput(event.target.value)} />
          </label>
        </div>

        <label className="input-label">
          Description
          <textarea
            className="text-input textarea-input"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
          />
        </label>

        <label className="input-label">
          Blocks JSON
          <textarea
            className="text-input code-input"
            value={blocksJson}
            onChange={(event) => setBlocksJson(event.target.value)}
            rows={14}
          />
        </label>

        <h3 className="subheading">Proposal Defaults</h3>
        <div className="form-grid four-col">
          <label className="input-label">
            Title prefix
            <input className="text-input" value={titlePrefix} onChange={(event) => setTitlePrefix(event.target.value)} />
          </label>
          <label className="input-label">
            Vote scope
            <select
              className="select-input"
              value={proposalVoteScope}
              onChange={(event) => setProposalVoteScope(event.target.value as 'community' | 'council')}
            >
              <option value="community">community</option>
              <option value="council">council</option>
            </select>
          </label>
          <label className="input-label">
            Proposal state
            <select
              className="select-input"
              value={proposalState}
              onChange={(event) => setProposalState(event.target.value as 'draft' | 'voting')}
            >
              <option value="draft">draft</option>
              <option value="voting">voting</option>
            </select>
          </label>
          <label className="input-label">
            Hold up seconds
            <input className="text-input" value={holdUpSeconds} onChange={(event) => setHoldUpSeconds(event.target.value)} />
          </label>
          <label className="input-label">
            Voting duration hours
            <input
              className="text-input"
              value={votingDurationHours}
              onChange={(event) => setVotingDurationHours(event.target.value)}
            />
          </label>
          <label className="input-label">
            Max risk score
            <input className="text-input" value={maxRiskScore} onChange={(event) => setMaxRiskScore(event.target.value)} />
          </label>
          <label className="checkbox-field">
            <input type="checkbox" checked={autoExecute} onChange={(event) => setAutoExecute(event.target.checked)} />
            Auto execute
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={executeAfterHoldUp}
              onChange={(event) => setExecuteAfterHoldUp(event.target.checked)}
            />
            Execute after hold up
          </label>
        </div>

        <h3 className="subheading">Compile Context</h3>
        <label className="input-label">
          Context JSON
          <textarea
            className="text-input code-input"
            value={compileContextJson}
            onChange={(event) => setCompileContextJson(event.target.value)}
            rows={5}
          />
        </label>

        <div className="button-row">
          <button type="button" className="secondary-button" onClick={resetForNewFlow}>
            New flow
          </button>
          <button type="button" className="primary-button" onClick={() => void handleSave()} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save flow'}
          </button>
          <button type="button" className="secondary-button" onClick={() => void handleCompile()} disabled={isCompiling}>
            {isCompiling ? 'Compiling...' : 'Compile flow'}
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => void handlePublish()}
            disabled={activeFlowId === newFlowKey || isPublishing}
          >
            {isPublishing ? 'Publishing...' : 'Publish flow'}
          </button>
        </div>

        {error ? <p className="error-text">{error}</p> : null}
        {success ? <p className="success-text">{success}</p> : null}
        {selectedDao ? <p className="hint-text">DAO: {selectedDao.name}</p> : null}
      </article>

      <article className="editor-card">
        <header className="editor-header">
          <h2>Publish Settings</h2>
          <p>These settings are used when creating proposal from the flow.</p>
        </header>

        <div className="form-grid two-col">
          <label className="input-label">
            Publish title (optional)
            <input className="text-input" value={publishTitle} onChange={(event) => setPublishTitle(event.target.value)} />
          </label>
          <label className="input-label">
            Publish description (optional)
            <input
              className="text-input"
              value={publishDescription}
              onChange={(event) => setPublishDescription(event.target.value)}
            />
          </label>
          <label className="input-label">
            Vote scope
            <select
              className="select-input"
              value={publishVoteScope}
              onChange={(event) => setPublishVoteScope(event.target.value as 'community' | 'council')}
            >
              <option value="community">community</option>
              <option value="council">council</option>
            </select>
          </label>
          <label className="input-label">
            State
            <select
              className="select-input"
              value={publishState}
              onChange={(event) => setPublishState(event.target.value as 'draft' | 'voting')}
            >
              <option value="draft">draft</option>
              <option value="voting">voting</option>
            </select>
          </label>
          <label className="input-label">
            Hold up seconds
            <input
              className="text-input"
              value={publishHoldUpSeconds}
              onChange={(event) => setPublishHoldUpSeconds(event.target.value)}
            />
          </label>
          <label className="input-label">
            Voting duration hours
            <input
              className="text-input"
              value={publishVotingDurationHours}
              onChange={(event) => setPublishVotingDurationHours(event.target.value)}
            />
          </label>
          <label className="input-label">
            Max risk score
            <input
              className="text-input"
              value={publishMaxRiskScore}
              onChange={(event) => setPublishMaxRiskScore(event.target.value)}
            />
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={publishAutoExecute}
              onChange={(event) => setPublishAutoExecute(event.target.checked)}
            />
            Auto execute
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={publishExecuteAfterHoldUp}
              onChange={(event) => setPublishExecuteAfterHoldUp(event.target.checked)}
            />
            Execute after hold up
          </label>
        </div>

        <h3 className="subheading">Onchain Create (Optional)</h3>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={onchainCreateEnabled}
            onChange={(event) => setOnchainCreateEnabled(event.target.checked)}
          />
          Enable auto onchain proposal creation
        </label>
        <p className="hint-text">
          Auto-create execution supports compiled transfer-sol, transfer-spl, and custom-instruction blocks directly.
          Config/program-upgrade/stream blocks require valid custom instruction bytes and metas.
        </p>

        {onchainCreateEnabled ? (
          <div className="form-grid two-col">
            <label className="input-label">
              Governance program id (optional)
              <input
                className="text-input"
                value={onchainGovernanceProgramId}
                onChange={(event) => setOnchainGovernanceProgramId(event.target.value)}
              />
            </label>
            <label className="input-label">
              Program version
              <input
                className="text-input"
                value={onchainProgramVersion}
                onChange={(event) => setOnchainProgramVersion(event.target.value)}
              />
            </label>
            <label className="input-label">
              Realm address
              <input
                className="text-input"
                value={onchainRealmAddress}
                onChange={(event) => setOnchainRealmAddress(event.target.value)}
              />
            </label>
            <label className="input-label">
              Governance address
              <input
                className="text-input"
                value={onchainGovernanceAddress}
                onChange={(event) => setOnchainGovernanceAddress(event.target.value)}
              />
            </label>
            <label className="input-label">
              Governing token mint
              <input
                className="text-input"
                value={onchainGoverningTokenMint}
                onChange={(event) => setOnchainGoverningTokenMint(event.target.value)}
              />
            </label>
            <label className="input-label">
              Description link (optional)
              <input
                className="text-input"
                value={onchainDescriptionLink}
                onChange={(event) => setOnchainDescriptionLink(event.target.value)}
              />
            </label>
            <label className="input-label">
              Option index
              <input
                className="text-input"
                value={onchainOptionIndex}
                onChange={(event) => setOnchainOptionIndex(event.target.value)}
              />
            </label>
            <label className="input-label">
              RPC URL (optional)
              <input className="text-input" value={onchainRpcUrl} onChange={(event) => setOnchainRpcUrl(event.target.value)} />
            </label>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={onchainUseDenyOption}
                onChange={(event) => setOnchainUseDenyOption(event.target.checked)}
              />
              Use deny option
            </label>
            <label className="checkbox-field">
              <input type="checkbox" checked={onchainSignOff} onChange={(event) => setOnchainSignOff(event.target.checked)} />
              Sign off proposal
            </label>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={onchainRequireSimulation}
                onChange={(event) => setOnchainRequireSimulation(event.target.checked)}
              />
              Require simulation
            </label>
          </div>
        ) : null}

        <h3 className="subheading">Compilation Output</h3>
        {compileResult ? (
          <div className="result-shell">
            <p>
              Risk: <strong>{compileResult.riskScore}</strong> ({compileResult.riskLevel})
            </p>
            <p>Instructions: {compileResult.instructions.length}</p>
            {compileResult.warnings.length > 0 ? (
              <ul className="result-list">
                {compileResult.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : (
              <p>No warnings.</p>
            )}
          </div>
        ) : (
          <p className="hint-text">Compile to inspect risk score and generated instructions.</p>
        )}

        <h3 className="subheading">Last Publish Result</h3>
        {lastPublishResult ? (
          <div className="result-shell">
            <p>
              Proposal ID: <strong>{lastPublishResult.proposalId}</strong>
            </p>
            <p>Flow status: {lastPublishResult.flow.status}</p>
            {lastPublishResult.onchainCreation ? (
              <>
                <p>Onchain signatures: {lastPublishResult.onchainCreation.signatures.length}</p>
                <p>Onchain proposal: {lastPublishResult.onchainCreation.onchainProposalAddress ?? 'N/A'}</p>
              </>
            ) : null}
            {lastPublishResult.onchainCreationError ? (
              <p className="error-text">Onchain creation error: {lastPublishResult.onchainCreationError}</p>
            ) : null}
            <p>Updated at: {formatDateTime(lastPublishResult.flow.updatedAt)}</p>
          </div>
        ) : (
          <p className="hint-text">Publish a flow to create a proposal and capture output.</p>
        )}
      </article>
    </section>
  );
};
