import { useEffect, useMemo, useState } from 'react';
import {
  compileFlowById,
  compileInlineFlow,
  createFlow,
  getFlowById,
  publishFlow,
  type DaoItem,
  type FlowBlockInput,
  type FlowCompilationResult,
  type FlowItem,
  type FlowProposalDefaults,
  type PublishFlowResult,
  updateFlow,
} from '@/features/dashboard/api/api';
import { formatDateTime } from '@/features/dashboard/lib/format';

const newFlowKey = '__new-flow';

type SupportedBlockType =
  | 'transfer-sol'
  | 'transfer-spl'
  | 'set-governance-config'
  | 'program-upgrade'
  | 'create-stream'
  | 'custom-instruction';

const supportedBlockTypes: Array<{ value: SupportedBlockType; label: string }> = [
  { value: 'transfer-sol', label: 'Transfer SOL' },
  { value: 'transfer-spl', label: 'Transfer SPL' },
  { value: 'set-governance-config', label: 'Set Governance Config' },
  { value: 'program-upgrade', label: 'Program Upgrade' },
  { value: 'create-stream', label: 'Create Stream' },
  { value: 'custom-instruction', label: 'Custom Instruction' },
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

const makeBlockId = (): string => `block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const defaultBlockForType = (type: SupportedBlockType): FlowBlockInput => {
  if (type === 'transfer-sol') {
    return {
      id: makeBlockId(),
      type,
      label: 'Treasury transfer',
      fromGovernance: '',
      toWallet: '',
      lamports: 1_000_000,
    };
  }

  if (type === 'transfer-spl') {
    return {
      id: makeBlockId(),
      type,
      label: 'Token transfer',
      tokenMint: '',
      fromTokenAccount: '',
      toTokenAccount: '',
      amount: '1',
      decimals: 6,
    };
  }

  if (type === 'set-governance-config') {
    return {
      id: makeBlockId(),
      type,
      label: 'Governance config update',
      governanceAddress: '',
      yesVoteThresholdPercent: 60,
      baseVotingTimeSeconds: 259200,
      minInstructionHoldUpTimeSeconds: 0,
      communityVetoThresholdPercent: 0,
    };
  }

  if (type === 'program-upgrade') {
    return {
      id: makeBlockId(),
      type,
      label: 'Upgrade program',
      programId: '',
      bufferAddress: '',
      spillAddress: '',
    };
  }

  if (type === 'create-stream') {
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    return {
      id: makeBlockId(),
      type,
      label: 'Create stream',
      streamProgramId: '',
      treasuryTokenAccount: '',
      recipientWallet: '',
      tokenMint: '',
      totalAmount: '100',
      startAt: now.toISOString(),
      endAt: in30Days.toISOString(),
      canCancel: true,
    };
  }

  return {
    id: makeBlockId(),
    type: 'custom-instruction',
    label: 'Custom instruction',
    programId: '',
    dataBase64: '',
    kind: 'custom',
    accounts: [],
    accountsCsv: '',
  };
};

const defaultBlocks: FlowBlockInput[] = [defaultBlockForType('transfer-sol')];

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

const getString = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);

const getNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
};

const getBoolean = (value: unknown, fallback = false): boolean =>
  typeof value === 'boolean' ? value : fallback;

const reorderBlocks = (blocks: FlowBlockInput[], sourceId: string, targetId: string): FlowBlockInput[] => {
  const sourceIndex = blocks.findIndex((block) => getString(block.id) === sourceId);
  const targetIndex = blocks.findIndex((block) => getString(block.id) === targetId);

  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return blocks;
  }

  const next = [...blocks];
  const [sourceBlock] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, sourceBlock);
  return next;
};

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
  const [draggingBlockId, setDraggingBlockId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [status, setStatus] = useState<'draft' | 'published' | 'archived'>('draft');
  const [blocks, setBlocks] = useState<FlowBlockInput[]>(defaultBlocks);

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

  const [onchainCreateEnabled, setOnchainCreateEnabled] = useState(true);
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

  useEffect(() => {
    if (!selectedDao) {
      return;
    }

    setOnchainGovernanceProgramId((current) => current || selectedDao.governanceProgramId);
    setOnchainRealmAddress((current) => current || selectedDao.realmAddress);
    setOnchainGoverningTokenMint((current) => current || selectedDao.communityMint || '');
  }, [selectedDao]);

  const resetForNewFlow = (): void => {
    setActiveFlowId(newFlowKey);
    setName('');
    setDescription('');
    setTagsInput('');
    setStatus('draft');
    setBlocks(defaultBlocks);
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
      setBlocks(Array.isArray(flow.blocks) && flow.blocks.length > 0 ? flow.blocks : defaultBlocks);
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

  const normalizeBlocksForApi = (items: FlowBlockInput[]): FlowBlockInput[] =>
    items.map((block) => {
      const type = getString(block.type) as SupportedBlockType;

      if (type === 'transfer-sol') {
        return {
          ...block,
          type,
          label: getString(block.label, 'Treasury transfer'),
          lamports: getNumber(block.lamports, 0),
        };
      }

      if (type === 'transfer-spl') {
        return {
          ...block,
          type,
          label: getString(block.label, 'Token transfer'),
          amount: getString(block.amount, '0'),
          decimals: getNumber(block.decimals, 0),
        };
      }

      if (type === 'set-governance-config') {
        return {
          ...block,
          type,
          yesVoteThresholdPercent: getNumber(block.yesVoteThresholdPercent, 0),
          baseVotingTimeSeconds: getNumber(block.baseVotingTimeSeconds, 0),
          minInstructionHoldUpTimeSeconds: getNumber(block.minInstructionHoldUpTimeSeconds, 0),
          communityVetoThresholdPercent:
            block.communityVetoThresholdPercent === undefined ? undefined : getNumber(block.communityVetoThresholdPercent, 0),
        };
      }

      if (type === 'program-upgrade') {
        return {
          ...block,
          type,
        };
      }

      if (type === 'create-stream') {
        return {
          ...block,
          type,
          totalAmount: getString(block.totalAmount, '0'),
          canCancel: getBoolean(block.canCancel, true),
        };
      }

      if (type === 'custom-instruction') {
        const accountsCsv = getString(block.accountsCsv, '');
        const accounts = accountsCsv
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean)
          .map((pubkey) => ({ pubkey, isSigner: false, isWritable: false }));

        return {
          id: getString(block.id, makeBlockId()),
          type,
          label: getString(block.label, 'Custom instruction'),
          programId: getString(block.programId),
          kind: getString(block.kind, 'custom'),
          dataBase64: getString(block.dataBase64),
          accounts,
        };
      }

      return block;
    });

  const buildFlowPayload = (): {
    name: string;
    description: string;
    tags: string[];
    blocks: FlowBlockInput[];
    proposalDefaults: FlowProposalDefaults;
  } => {
    if (!Array.isArray(blocks) || blocks.length === 0) {
      throw new Error('Add at least one block to the flow');
    }

    const payloadName = name.trim();

    if (payloadName.length < 2) {
      throw new Error('Flow name must be at least 2 characters');
    }

    const normalizedBlocks = normalizeBlocksForApi(blocks);

    normalizedBlocks.forEach((block, index) => {
      if (!getString(block.id)) {
        throw new Error(`Block ${index + 1} must have an id`);
      }

      if (!getString(block.type)) {
        throw new Error(`Block ${index + 1} must have a type`);
      }

      if (!getString(block.label)) {
        throw new Error(`Block ${index + 1} must have a label`);
      }
    });

    return {
      name: payloadName,
      description: description.trim(),
      tags: toTags(tagsInput),
      blocks: normalizedBlocks,
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

  const addBlock = (type: SupportedBlockType): void => {
    setBlocks((current) => [...current, defaultBlockForType(type)]);
  };

  const removeBlock = (blockId: string): void => {
    setBlocks((current) => current.filter((block) => getString(block.id) !== blockId));
  };

  const changeBlockType = (blockId: string, nextType: SupportedBlockType): void => {
    setBlocks((current) =>
      current.map((block) => {
        if (getString(block.id) !== blockId) {
          return block;
        }

        const next = defaultBlockForType(nextType);
        return {
          ...next,
          id: blockId,
          label: getString(block.label, getString(next.label)),
        };
      }),
    );
  };

  const setBlockField = (blockId: string, field: string, value: unknown): void => {
    setBlocks((current) =>
      current.map((block) => {
        if (getString(block.id) !== blockId) {
          return block;
        }

        return {
          ...block,
          [field]: value,
        };
      }),
    );
  };

  const onBlockDrop = (targetBlockId: string): void => {
    if (!draggingBlockId || draggingBlockId === targetBlockId) {
      return;
    }

    setBlocks((current) => reorderBlocks(current, draggingBlockId, targetBlockId));
    setDraggingBlockId(null);
  };

  const renderNodeFields = (block: FlowBlockInput): JSX.Element => {
    const blockId = getString(block.id);
    const type = getString(block.type) as SupportedBlockType;

    if (type === 'transfer-sol') {
      return (
        <div className="form-grid two-col">
          <label className="input-label">
            From governance
            <input className="text-input" value={getString(block.fromGovernance)} onChange={(event) => setBlockField(blockId, 'fromGovernance', event.target.value)} />
          </label>
          <label className="input-label">
            To wallet
            <input className="text-input" value={getString(block.toWallet)} onChange={(event) => setBlockField(blockId, 'toWallet', event.target.value)} />
          </label>
          <label className="input-label">
            Lamports
            <input className="text-input" type="number" min={0} value={getNumber(block.lamports, 0)} onChange={(event) => setBlockField(blockId, 'lamports', Number(event.target.value))} />
          </label>
        </div>
      );
    }

    if (type === 'transfer-spl') {
      return (
        <div className="form-grid two-col">
          <label className="input-label">
            Token mint
            <input className="text-input" value={getString(block.tokenMint)} onChange={(event) => setBlockField(blockId, 'tokenMint', event.target.value)} />
          </label>
          <label className="input-label">
            Amount
            <input className="text-input" value={getString(block.amount, '0')} onChange={(event) => setBlockField(blockId, 'amount', event.target.value)} />
          </label>
          <label className="input-label">
            From token account
            <input className="text-input" value={getString(block.fromTokenAccount)} onChange={(event) => setBlockField(blockId, 'fromTokenAccount', event.target.value)} />
          </label>
          <label className="input-label">
            To token account
            <input className="text-input" value={getString(block.toTokenAccount)} onChange={(event) => setBlockField(blockId, 'toTokenAccount', event.target.value)} />
          </label>
          <label className="input-label">
            Decimals
            <input className="text-input" type="number" min={0} max={18} value={getNumber(block.decimals, 6)} onChange={(event) => setBlockField(blockId, 'decimals', Number(event.target.value))} />
          </label>
        </div>
      );
    }

    if (type === 'set-governance-config') {
      return (
        <div className="form-grid two-col">
          <label className="input-label">
            Governance address
            <input className="text-input" value={getString(block.governanceAddress)} onChange={(event) => setBlockField(blockId, 'governanceAddress', event.target.value)} />
          </label>
          <label className="input-label">
            Yes threshold (%)
            <input className="text-input" type="number" min={0} max={100} value={getNumber(block.yesVoteThresholdPercent, 60)} onChange={(event) => setBlockField(blockId, 'yesVoteThresholdPercent', Number(event.target.value))} />
          </label>
          <label className="input-label">
            Base voting time (sec)
            <input className="text-input" type="number" min={0} value={getNumber(block.baseVotingTimeSeconds, 259200)} onChange={(event) => setBlockField(blockId, 'baseVotingTimeSeconds', Number(event.target.value))} />
          </label>
          <label className="input-label">
            Hold-up time (sec)
            <input className="text-input" type="number" min={0} value={getNumber(block.minInstructionHoldUpTimeSeconds, 0)} onChange={(event) => setBlockField(blockId, 'minInstructionHoldUpTimeSeconds', Number(event.target.value))} />
          </label>
        </div>
      );
    }

    if (type === 'program-upgrade') {
      return (
        <div className="form-grid two-col">
          <label className="input-label">
            Program ID
            <input className="text-input" value={getString(block.programId)} onChange={(event) => setBlockField(blockId, 'programId', event.target.value)} />
          </label>
          <label className="input-label">
            Buffer address
            <input className="text-input" value={getString(block.bufferAddress)} onChange={(event) => setBlockField(blockId, 'bufferAddress', event.target.value)} />
          </label>
          <label className="input-label">
            Spill address
            <input className="text-input" value={getString(block.spillAddress)} onChange={(event) => setBlockField(blockId, 'spillAddress', event.target.value)} />
          </label>
        </div>
      );
    }

    if (type === 'create-stream') {
      return (
        <div className="form-grid two-col">
          <label className="input-label">
            Stream program ID
            <input className="text-input" value={getString(block.streamProgramId)} onChange={(event) => setBlockField(blockId, 'streamProgramId', event.target.value)} />
          </label>
          <label className="input-label">
            Treasury token account
            <input className="text-input" value={getString(block.treasuryTokenAccount)} onChange={(event) => setBlockField(blockId, 'treasuryTokenAccount', event.target.value)} />
          </label>
          <label className="input-label">
            Recipient wallet
            <input className="text-input" value={getString(block.recipientWallet)} onChange={(event) => setBlockField(blockId, 'recipientWallet', event.target.value)} />
          </label>
          <label className="input-label">
            Token mint
            <input className="text-input" value={getString(block.tokenMint)} onChange={(event) => setBlockField(blockId, 'tokenMint', event.target.value)} />
          </label>
          <label className="input-label">
            Total amount
            <input className="text-input" value={getString(block.totalAmount, '0')} onChange={(event) => setBlockField(blockId, 'totalAmount', event.target.value)} />
          </label>
          <label className="input-label">
            Start at (ISO datetime)
            <input className="text-input" value={getString(block.startAt)} onChange={(event) => setBlockField(blockId, 'startAt', event.target.value)} />
          </label>
          <label className="input-label">
            End at (ISO datetime)
            <input className="text-input" value={getString(block.endAt)} onChange={(event) => setBlockField(blockId, 'endAt', event.target.value)} />
          </label>
          <label className="checkbox-field">
            <input type="checkbox" checked={getBoolean(block.canCancel, true)} onChange={(event) => setBlockField(blockId, 'canCancel', event.target.checked)} />
            Can cancel stream
          </label>
        </div>
      );
    }

    return (
      <div className="form-grid two-col">
        <label className="input-label">
          Program ID
          <input className="text-input" value={getString(block.programId)} onChange={(event) => setBlockField(blockId, 'programId', event.target.value)} />
        </label>
        <label className="input-label">
          Kind
          <select className="select-input" value={getString(block.kind, 'custom')} onChange={(event) => setBlockField(blockId, 'kind', event.target.value)}>
            <option value="custom">custom</option>
            <option value="defi">defi</option>
            <option value="governance">governance</option>
          </select>
        </label>
        <label className="input-label">
          Data (base64)
          <textarea className="text-input code-input" value={getString(block.dataBase64)} onChange={(event) => setBlockField(blockId, 'dataBase64', event.target.value)} rows={3} />
        </label>
        <label className="input-label">
          Accounts (comma-separated pubkeys)
          <textarea className="text-input code-input" value={getString(block.accountsCsv)} onChange={(event) => setBlockField(blockId, 'accountsCsv', event.target.value)} rows={3} />
        </label>
      </div>
    );
  };

  return (
    <section className="editor-grid">
      <article className="editor-card">
        <header className="editor-header">
          <h2>Flow Studio</h2>
          <p>Build workflow logic using drag-and-drop blocks, then compile and publish.</p>
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

        <h3 className="subheading">Blocks Canvas</h3>
        <div className="flow-palette">
          {supportedBlockTypes.map((typeItem) => (
            <button
              key={typeItem.value}
              type="button"
              className="secondary-button"
              onClick={() => addBlock(typeItem.value)}
            >
              + {typeItem.label}
            </button>
          ))}
        </div>

        <div className="flow-canvas">
          {blocks.map((block, index) => {
            const blockId = getString(block.id, makeBlockId());
            const blockType = getString(block.type, 'transfer-sol') as SupportedBlockType;

            return (
              <div key={blockId} className="flow-node-wrap">
                <article
                  className="flow-node-card"
                  draggable
                  onDragStart={() => setDraggingBlockId(blockId)}
                  onDragEnd={() => setDraggingBlockId(null)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => onBlockDrop(blockId)}
                >
                  <div className="flow-node-header">
                    <div className="flow-node-title">
                      <span className="status-chip status-chip--gray">#{index + 1}</span>
                      <strong>{getString(block.label, 'Untitled block')}</strong>
                    </div>
                    <button type="button" className="secondary-button" onClick={() => removeBlock(blockId)}>
                      Remove
                    </button>
                  </div>

                  <div className="form-grid two-col">
                    <label className="input-label">
                      Label
                      <input
                        className="text-input"
                        value={getString(block.label)}
                        onChange={(event) => setBlockField(blockId, 'label', event.target.value)}
                      />
                    </label>
                    <label className="input-label">
                      Type
                      <select
                        className="select-input"
                        value={blockType}
                        onChange={(event) => changeBlockType(blockId, event.target.value as SupportedBlockType)}
                      >
                        {supportedBlockTypes.map((typeItem) => (
                          <option key={typeItem.value} value={typeItem.value}>
                            {typeItem.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {renderNodeFields(block)}
                </article>

                {index < blocks.length - 1 ? <div className="flow-connector" aria-hidden="true">↓</div> : null}
              </div>
            );
          })}
        </div>

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
          <p>Publishing creates a proposal record; enable on-chain creation to push directly to Realms.</p>
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

        <h3 className="subheading">On-chain Proposal Creation</h3>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={onchainCreateEnabled}
            onChange={(event) => setOnchainCreateEnabled(event.target.checked)}
          />
          Create proposal on-chain during publish
        </label>

        {onchainCreateEnabled ? (
          <div className="form-grid two-col">
            <label className="input-label">
              Governance program id
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
                <p>On-chain signatures: {lastPublishResult.onchainCreation.signatures.length}</p>
                <p>On-chain proposal: {lastPublishResult.onchainCreation.onchainProposalAddress ?? 'N/A'}</p>
              </>
            ) : null}
            {lastPublishResult.onchainCreationError ? (
              <p className="error-text">On-chain creation error: {lastPublishResult.onchainCreationError}</p>
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
