import { useEffect, useMemo, useRef, useState } from 'react';
import {
  compileInlineFlow,
  getDaoById,
  getDaoGovernances,
  getFlowById,
  publishFlow,
  updateProposalOnchainExecution,
  type DaoGovernanceItem,
  type DaoItem,
  type FlowBlockInput,
  type FlowCompilationResult,
  type FlowGraph,
  type FlowGraphEdge,
  type FlowGraphNode,
  type PublishFlowResult,
  updateFlow,
} from '@/features/dashboard/api/api';
import { formatDateTime } from '@/features/dashboard/lib/format';
import { getSolanaProvider, sendPreparedTransaction } from '@/shared/solana/wallet';
import ReactFlow, {
  Background,
  Controls,
  Handle,
  Position,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
} from 'reactflow';
import { NodeResizer } from '@reactflow/node-resizer';
import 'reactflow/dist/style.css';
import '@reactflow/node-resizer/dist/style.css';

const canvasNodeHeight = 210;
const defaultNodeWidth = 360;
const minNodeWidth = 280;
const maxNodeWidth = 560;
const PLACEHOLDER_PUBKEY = '11111111111111111111111111111111';
const PLACEHOLDER_BASE64 = 'AQ==';

type SupportedBlockType =
  | 'transfer-sol'
  | 'transfer-spl'
  | 'set-governance-config'
  | 'program-upgrade'
  | 'create-token-account'
  | 'create-stream'
  | 'custom-instruction';

const supportedBlockTypes: Array<{ value: SupportedBlockType; label: string }> = [
  { value: 'transfer-sol', label: 'Transfer SOL' },
  { value: 'transfer-spl', label: 'Transfer SPL' },
  { value: 'set-governance-config', label: 'Set Governance Config' },
  { value: 'program-upgrade', label: 'Program Upgrade' },
  { value: 'create-token-account', label: 'Create Token Account' },
  { value: 'create-stream', label: 'Create Stream' },
  { value: 'custom-instruction', label: 'Custom Instruction' },
];

type FlowBlockNodeData = {
  block: FlowBlockInput;
  blockType: SupportedBlockType;
  orderIndex: number;
  onRemove: (blockId: string) => void;
  onChangeType: (blockId: string, nextType: SupportedBlockType) => void;
  onChangeField: (blockId: string, field: string, value: unknown) => void;
  onResizeWidth: (blockId: string, width: number) => void;
  renderFields: (block: FlowBlockInput) => JSX.Element;
};

const FlowBlockNode = ({ id, data, selected }: NodeProps<FlowBlockNodeData>): JSX.Element => {
  const blockId = getString(data.block.id, id);

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={minNodeWidth}
        minHeight={canvasNodeHeight}
        lineStyle={{ borderColor: '#111' }}
        handleStyle={{ width: 12, height: 12, border: '2px solid #111', background: '#f4d400', borderRadius: 0 }}
        onResizeEnd={(_, params) => data.onResizeWidth(blockId, getNumber((params as { width?: number }).width, defaultNodeWidth))}
      />
      <Handle type="target" position={Position.Left} />
      <div className="flow-block-node">
        <div className="flow-node-header">
          <div className="flow-node-title">
            <span className="status-chip status-chip--gray">#{data.orderIndex > 0 ? data.orderIndex : '-'}</span>
            <strong>{getString(data.block.label, 'Untitled block')}</strong>
          </div>

          <div className="flow-node-actions nodrag">
            <button type="button" className="secondary-button flow-node-mini nodrag" onClick={() => data.onRemove(blockId)}>
              Remove
            </button>
          </div>
        </div>

        <div className="form-grid two-col nodrag">
          <label className="input-label">
            Label
            <input
              className="text-input"
              value={getString(data.block.label)}
              onChange={(event) => data.onChangeField(blockId, 'label', event.target.value)}
            />
          </label>
          <label className="input-label">
            Type
            <select
              className="select-input"
              value={data.blockType}
              onChange={(event) => data.onChangeType(blockId, event.target.value as SupportedBlockType)}
            >
              {supportedBlockTypes.map((typeItem) => (
                <option key={typeItem.value} value={typeItem.value}>
                  {typeItem.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="nodrag">{data.renderFields(data.block)}</div>
      </div>
      <Handle type="source" position={Position.Right} />
    </>
  );
};

const flowNodeTypes: NodeTypes = {
  flowBlock: FlowBlockNode,
};

const makeBlockId = (): string => `block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const makeEdgeId = (sourceId: string, targetId: string, index: number): string =>
  `edge-${sourceId.slice(-4)}-${targetId.slice(-4)}-${index}`;

const getDefaultNodePosition = (index: number): { x: number; y: number } => ({
  x: 40 + (index % 3) * 420,
  y: 40 + Math.floor(index / 3) * 260,
});

const createDefaultBlock = (): FlowBlockInput => ({
  id: makeBlockId(),
  type: 'transfer-sol',
  label: 'Treasury transfer',
  fromGovernance: PLACEHOLDER_PUBKEY,
  toWallet: PLACEHOLDER_PUBKEY,
  lamports: 1_000_000,
});

const defaultBlockForType = (type: SupportedBlockType): FlowBlockInput => {
  if (type === 'transfer-sol') {
    return {
      id: makeBlockId(),
      type,
      label: 'Treasury transfer',
      fromGovernance: PLACEHOLDER_PUBKEY,
      toWallet: PLACEHOLDER_PUBKEY,
      lamports: 1_000_000,
    };
  }

  if (type === 'transfer-spl') {
    return {
      id: makeBlockId(),
      type,
      label: 'Token transfer',
      tokenMint: PLACEHOLDER_PUBKEY,
      fromTokenAccount: PLACEHOLDER_PUBKEY,
      toTokenAccount: PLACEHOLDER_PUBKEY,
      amount: '1',
      decimals: 6,
    };
  }

  if (type === 'set-governance-config') {
    return {
      id: makeBlockId(),
      type,
      label: 'Governance config update',
      governanceAddress: PLACEHOLDER_PUBKEY,
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
      programId: PLACEHOLDER_PUBKEY,
      bufferAddress: PLACEHOLDER_PUBKEY,
      spillAddress: PLACEHOLDER_PUBKEY,
    };
  }

  if (type === 'create-token-account') {
    return {
      id: makeBlockId(),
      type,
      label: 'Create token account',
      payer: PLACEHOLDER_PUBKEY,
      owner: PLACEHOLDER_PUBKEY,
      mint: PLACEHOLDER_PUBKEY,
    };
  }

  if (type === 'create-stream') {
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    return {
      id: makeBlockId(),
      type,
      label: 'Create stream',
      streamProgramId: PLACEHOLDER_PUBKEY,
      treasuryTokenAccount: PLACEHOLDER_PUBKEY,
      recipientWallet: PLACEHOLDER_PUBKEY,
      tokenMint: PLACEHOLDER_PUBKEY,
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
    programId: PLACEHOLDER_PUBKEY,
    dataBase64: PLACEHOLDER_BASE64,
    kind: 'custom',
    accounts: [],
    accountsCsv: '',
  };
};

const deriveGraphFromBlocks = (blocks: FlowBlockInput[]): FlowGraph => {
  const nodes: FlowGraphNode[] = blocks.map((block, index) => {
    const blockId = getString(block.id, makeBlockId());
    const { x, y } = getDefaultNodePosition(index);
    return { id: blockId, x, y };
  });

  return { nodes, edges: [] };
};

const normalizeGraphForBlocks = (
  blocks: FlowBlockInput[],
  graphNodes: FlowGraphNode[],
  graphEdges: FlowGraphEdge[],
): FlowGraph => {
  const blockIds = blocks.map((block) => getString(block.id)).filter(Boolean);
  const blockIdSet = new Set(blockIds);
  const uniqueNodes = new Map<string, FlowGraphNode>();

  graphNodes.forEach((node) => {
    if (!blockIdSet.has(node.id) || uniqueNodes.has(node.id)) {
      return;
    }

    uniqueNodes.set(node.id, {
      id: node.id,
      x: Number.isFinite(node.x) ? Math.max(0, node.x) : 0,
      y: Number.isFinite(node.y) ? Math.max(0, node.y) : 0,
    });
  });

  const nodes: FlowGraphNode[] = blockIds.map((id, index) => {
    const existing = uniqueNodes.get(id);

    if (existing) {
      return existing;
    }

    const { x, y } = getDefaultNodePosition(index);
    return { id, x, y };
  });

  const edgeKeys = new Set<string>();
  const edges: FlowGraphEdge[] = [];

  graphEdges.forEach((edge, index) => {
    if (!blockIdSet.has(edge.source) || !blockIdSet.has(edge.target) || edge.source === edge.target) {
      return;
    }

    const edgeKey = `${edge.source}->${edge.target}`;

    if (edgeKeys.has(edgeKey)) {
      return;
    }

    edgeKeys.add(edgeKey);
    edges.push({
      id: edge.id || makeEdgeId(edge.source, edge.target, index),
      source: edge.source,
      target: edge.target,
    });
  });

  return { nodes, edges };
};

const topologicalSortBlocks = (blocks: FlowBlockInput[], edges: FlowGraphEdge[]): FlowBlockInput[] => {
  const blockIds = blocks.map((block) => getString(block.id));
  const blockMap = new Map(blocks.map((block) => [getString(block.id), block]));
  const indexMap = new Map(blockIds.map((id, index) => [id, index]));
  const adjacency = new Map<string, Set<string>>();
  const inDegree = new Map<string, number>();

  blockIds.forEach((id) => {
    adjacency.set(id, new Set<string>());
    inDegree.set(id, 0);
  });

  edges.forEach((edge) => {
    if (!indexMap.has(edge.source) || !indexMap.has(edge.target) || edge.source === edge.target) {
      return;
    }

    const neighbours = adjacency.get(edge.source);

    if (!neighbours || neighbours.has(edge.target)) {
      return;
    }

    neighbours.add(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  });

  const queue = blockIds
    .filter((id) => (inDegree.get(id) ?? 0) === 0)
    .sort((left, right) => (indexMap.get(left) ?? 0) - (indexMap.get(right) ?? 0));

  const orderedIds: string[] = [];

  while (queue.length > 0) {
    const nextId = queue.shift();

    if (!nextId) {
      break;
    }

    orderedIds.push(nextId);

    const neighbours = [...(adjacency.get(nextId) ?? [])].sort(
      (left, right) => (indexMap.get(left) ?? 0) - (indexMap.get(right) ?? 0),
    );

    neighbours.forEach((targetId) => {
      const nextInDegree = (inDegree.get(targetId) ?? 0) - 1;
      inDegree.set(targetId, nextInDegree);

      if (nextInDegree === 0) {
        queue.push(targetId);
        queue.sort((left, right) => (indexMap.get(left) ?? 0) - (indexMap.get(right) ?? 0));
      }
    });
  }

  if (orderedIds.length !== blocks.length) {
    throw new Error('Flow has circular links. Remove cycles before compile/publish.');
  }

  return orderedIds.map((id) => blockMap.get(id)).filter((block): block is FlowBlockInput => Boolean(block));
};

const parseJson = <TValue,>(raw: string, label: string): TValue => {
  try {
    return JSON.parse(raw) as TValue;
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }
};

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

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

type FlowEditorProps = {
  accessToken: string;
  flowId: string;
  onFlowSaved: () => void;
  onFlowPublished: (result: PublishFlowResult) => void;
};

type EditorStep = 'builder' | 'compile' | 'publish';

export const FlowEditor = ({ accessToken, flowId, onFlowSaved, onFlowPublished }: FlowEditorProps): JSX.Element => {
  const autosaveTimerRef = useRef<number | null>(null);

  const [activeStep, setActiveStep] = useState<EditorStep>('builder');
  const [flowName, setFlowName] = useState('');
  const [flowDescription, setFlowDescription] = useState('');
  const [flowDaoId, setFlowDaoId] = useState('');
  const [daoContext, setDaoContext] = useState<DaoItem | null>(null);
  const [governanceOptions, setGovernanceOptions] = useState<DaoGovernanceItem[]>([]);
  const [isLoadingDaoContext, setIsLoadingDaoContext] = useState(false);
  const [isLoadingFlow, setIsLoadingFlow] = useState(true);
  const [isHydrating, setIsHydrating] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const [isCompiling, setIsCompiling] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [blocks, setBlocks] = useState<FlowBlockInput[]>([]);
  const [graphNodes, setGraphNodes] = useState<FlowGraphNode[]>([]);
  const [graphEdges, setGraphEdges] = useState<FlowGraphEdge[]>([]);
  const [nodeWidths, setNodeWidths] = useState<Record<string, number>>({});

  const [compileContextJson, setCompileContextJson] = useState('{}');
  const [compileResult, setCompileResult] = useState<FlowCompilationResult | null>(null);
  const [lastPublishResult, setLastPublishResult] = useState<PublishFlowResult | null>(null);
  const [publishOnchainNow, setPublishOnchainNow] = useState(true);
  const [publishRealmAddress, setPublishRealmAddress] = useState('');
  const [publishGovernanceProgramId, setPublishGovernanceProgramId] = useState('');
  const [publishGovernanceAddress, setPublishGovernanceAddress] = useState('');
  const [publishGoverningTokenMint, setPublishGoverningTokenMint] = useState('');
  const [publishUseGovernanceOverride, setPublishUseGovernanceOverride] = useState(false);

  const graphNodeMap = useMemo(() => new Map(graphNodes.map((node) => [node.id, node])), [graphNodes]);
  const selectedGovernance = useMemo(
    () => governanceOptions.find((item) => item.address === publishGovernanceAddress) ?? null,
    [governanceOptions, publishGovernanceAddress],
  );
  const getNodeWidth = (nodeId: string): number => nodeWidths[nodeId] ?? defaultNodeWidth;
  const saveStateLabel = isAutoSaving ? 'Auto-saving...' : isDirty ? 'Unsaved changes' : 'Saved';

  const orderingPreview = useMemo(() => {
    try {
      return {
        ids: topologicalSortBlocks(blocks, graphEdges).map((block) => getString(block.id)),
        error: null,
      };
    } catch (orderingError) {
      return {
        ids: blocks.map((block) => getString(block.id)),
        error: orderingError instanceof Error ? orderingError.message : 'Invalid links',
      };
    }
  }, [blocks, graphEdges]);

  const markDirty = (): void => {
    if (!isHydrating) {
      setIsDirty(true);
      setCompileResult(null);
    }
  };

  const hydrateFlow = async (): Promise<void> => {
    setIsLoadingFlow(true);
    setError(null);

    try {
      const flow = await getFlowById(flowId);
      setIsHydrating(true);

      const loadedBlocks = Array.isArray(flow.blocks) && flow.blocks.length > 0 ? flow.blocks : [createDefaultBlock()];
      const fallbackGraph = deriveGraphFromBlocks(loadedBlocks);
      const normalizedGraph = normalizeGraphForBlocks(
        loadedBlocks,
        flow.graph?.nodes ?? fallbackGraph.nodes,
        flow.graph?.edges ?? fallbackGraph.edges,
      );

      setFlowName(flow.name);
      setFlowDescription(flow.description ?? '');
      setFlowDaoId(flow.daoId);
      setBlocks(loadedBlocks);
      setGraphNodes(normalizedGraph.nodes);
      setGraphEdges(normalizedGraph.edges);
      setNodeWidths(
        Object.fromEntries(
          normalizedGraph.nodes.map((node) => {
            const matchingBlock = loadedBlocks.find((block) => getString(block.id) === node.id);
            return [node.id, clamp(getNumber(matchingBlock?.uiWidth, defaultNodeWidth), minNodeWidth, maxNodeWidth)];
          }),
        ),
      );
      setActiveStep('builder');
      setIsDirty(false);
      setCompileResult(null);
      setLastPublishResult(null);
      setSuccess(null);
      setLastSavedAt(flow.updatedAt);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load flow');
    } finally {
      setIsHydrating(false);
      setIsLoadingFlow(false);
    }
  };

  useEffect(() => {
    void hydrateFlow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowId]);

  useEffect(() => {
    if (!flowDaoId) {
      setDaoContext(null);
      setGovernanceOptions([]);
      setPublishRealmAddress('');
      setPublishGovernanceProgramId('');
      setPublishGovernanceAddress('');
      setPublishGoverningTokenMint('');
      return;
    }

    let isMounted = true;

    const loadDaoContext = async (): Promise<void> => {
      setIsLoadingDaoContext(true);

      try {
        const [dao, governanceResponse] = await Promise.all([getDaoById(flowDaoId), getDaoGovernances(flowDaoId)]);

        if (!isMounted) {
          return;
        }

        setDaoContext(dao);
        setGovernanceOptions(governanceResponse.items);
        setPublishRealmAddress(dao.realmAddress);
        setPublishGovernanceProgramId(dao.governanceProgramId);
        setPublishGoverningTokenMint(dao.communityMint ?? '');
        setPublishUseGovernanceOverride(false);
        setPublishGovernanceAddress(() => {
          if (dao.defaultGovernanceAddress) {
            return dao.defaultGovernanceAddress;
          }

          if (governanceResponse.items.length === 1) {
            return governanceResponse.items[0].address;
          }

          return '';
        });
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        setDaoContext(null);
        setGovernanceOptions([]);
        setPublishRealmAddress('');
        setPublishGovernanceProgramId('');
        setPublishGovernanceAddress('');
        setPublishGoverningTokenMint('');
        setError(loadError instanceof Error ? loadError.message : 'Unable to load DAO context for publishing');
      } finally {
        if (isMounted) {
          setIsLoadingDaoContext(false);
        }
      }
    };

    void loadDaoContext();

    return () => {
      isMounted = false;
    };
  }, [flowDaoId]);

  useEffect(() => {
    if (!daoContext) {
      return;
    }

    setBlocks((current) => current.map((block) => applyDaoDefaultsToBlock(block)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    daoContext?.id,
    daoContext?.communityMint,
    selectedGovernance?.address,
    selectedGovernance?.nativeTreasuryAddress,
    publishGoverningTokenMint,
  ]);

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

      if (type === 'create-token-account') {
        return {
          ...block,
          type,
          label: getString(block.label, 'Create token account'),
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

      return {
        ...block,
        type,
      };
    });

  const buildDraftPayload = (requireAcyclic: boolean): { blocks: FlowBlockInput[]; graph: FlowGraph } => {
    if (!Array.isArray(blocks) || blocks.length === 0) {
      throw new Error('Add at least one block to continue.');
    }

    const normalizedGraph = normalizeGraphForBlocks(blocks, graphNodes, graphEdges);
    const baseBlocks = requireAcyclic ? topologicalSortBlocks(blocks, normalizedGraph.edges) : blocks;
    const normalizedBlocks = normalizeBlocksForApi(baseBlocks).map((block) => ({
      ...block,
      uiWidth: getNodeWidth(getString(block.id)),
    }));

    return {
      blocks: normalizedBlocks,
      graph: normalizedGraph,
    };
  };

  const persistDraft = async (requireAcyclic: boolean): Promise<{ blocks: FlowBlockInput[]; graph: FlowGraph } | null> => {
    try {
      const payload = buildDraftPayload(requireAcyclic);
      setIsAutoSaving(true);

      await updateFlow(
        flowId,
        {
          blocks: payload.blocks,
          graph: payload.graph,
        },
        accessToken,
      );

      setIsDirty(false);
      setLastSavedAt(new Date().toISOString());
      onFlowSaved();
      return payload;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Auto-save failed');
      return null;
    } finally {
      setIsAutoSaving(false);
    }
  };

  useEffect(() => {
    if (isHydrating || !isDirty || isPublishing || isCompiling) {
      return;
    }

    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = window.setTimeout(() => {
      void persistDraft(false);
    }, 1200);

    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, blocks, graphNodes, graphEdges, isHydrating, isPublishing, isCompiling]);

  const handleCompile = async (): Promise<void> => {
    setError(null);
    setSuccess(null);
    setIsCompiling(true);

    try {
      const payload = await persistDraft(true);

      if (!payload) {
        return;
      }

      const contextRaw = compileContextJson.trim();
      const context = contextRaw ? parseJson<Record<string, unknown>>(contextRaw, 'Compile context') : {};
      const result = await compileInlineFlow(payload.blocks, context, accessToken);

      setCompileResult(result);
      setActiveStep('compile');
      setSuccess('Compile complete. You can now publish.');
    } catch (compileError) {
      setError(compileError instanceof Error ? compileError.message : 'Compile failed');
    } finally {
      setIsCompiling(false);
    }
  };

  const handlePublish = async (): Promise<void> => {
    if (!compileResult) {
      setError('Compile first, then publish.');
      return;
    }

    if (publishOnchainNow) {
      if (!publishRealmAddress.trim()) {
        setError('Realm address is required for on-chain publish.');
        return;
      }

      if (!publishGovernanceProgramId.trim()) {
        setError('Governance program ID is required for on-chain publish.');
        return;
      }

      if (!publishGoverningTokenMint.trim()) {
        setError('Governing token mint is required for on-chain publish.');
        return;
      }
    }

    setError(null);
    setSuccess(null);
    setIsPublishing(true);

    try {
      const payload = await persistDraft(true);

      if (!payload) {
        return;
      }

      const result = await publishFlow(
        flowId,
        publishOnchainNow
          ? {
              onchainCreate: {
                enabled: true,
                governanceProgramId: publishGovernanceProgramId.trim() || undefined,
                programVersion: 3,
                realmAddress: publishRealmAddress.trim() || undefined,
                governanceAddress: publishGovernanceAddress.trim() || undefined,
                governingTokenMint: publishGoverningTokenMint.trim() || undefined,
                optionIndex: 0,
                useDenyOption: true,
                signOff: true,
                requireSimulation: true,
              },
            }
          : {},
        accessToken,
      );

      let onchainSignatures: string[] = [];

      if (publishOnchainNow) {
        if (!result.onchainPreparation) {
          throw new Error('On-chain preparation was not returned by the server.');
        }

        const provider = getSolanaProvider();

        if (!provider) {
          throw new Error('No Solana wallet detected. Install Phantom or another wallet extension.');
        }

        const connectResult = await provider.connect();
        const connectedWallet = connectResult.publicKey?.toBase58() ?? provider.publicKey?.toBase58();

        if (!connectedWallet) {
          throw new Error('Wallet connection failed. Try reconnecting your wallet.');
        }

        for (const prepared of result.onchainPreparation.preparedTransactions) {
          const signature = await sendPreparedTransaction(
            provider,
            prepared.transactionMessage,
            prepared.transactionBase58,
            prepared.transactionBase64,
            {
              rpcUrl: result.onchainPreparation.onchainExecution.rpcUrl,
              recentBlockhash: prepared.recentBlockhash,
              lastValidBlockHeight: prepared.lastValidBlockHeight,
            },
          );
          onchainSignatures.push(signature);
        }

        await updateProposalOnchainExecution(result.proposalId, result.onchainPreparation.onchainExecution, accessToken);
      }

      setLastPublishResult(result);
      setSuccess(
        publishOnchainNow
          ? `Flow published and submitted on-chain (${onchainSignatures.length} wallet signatures).`
          : 'Flow published successfully.',
      );
      onFlowPublished(result);
      onFlowSaved();
      setCompileResult(result.compilation);
      setLastSavedAt(new Date().toISOString());
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : 'Publish failed');
    } finally {
      setIsPublishing(false);
    }
  };

  const useDaoDefaultPubkey = (value: unknown, defaultValue?: string | null): string => {
    const current = getString(value).trim();

    if (current.length > 0 && current !== PLACEHOLDER_PUBKEY) {
      return current;
    }

    const fallback = (defaultValue ?? '').trim();
    return fallback.length > 0 ? fallback : PLACEHOLDER_PUBKEY;
  };

  const applyDaoDefaultsToBlock = (block: FlowBlockInput): FlowBlockInput => {
    const blockType = getString(block.type) as SupportedBlockType;
    const governanceAddress = selectedGovernance?.address ?? '';
    const nativeTreasuryAddress = selectedGovernance?.nativeTreasuryAddress ?? '';
    const communityMint = publishGoverningTokenMint || daoContext?.communityMint || '';

    if (blockType === 'transfer-sol') {
      return {
        ...block,
        fromGovernance: useDaoDefaultPubkey(block.fromGovernance, nativeTreasuryAddress),
        toWallet: useDaoDefaultPubkey(block.toWallet),
      };
    }

    if (blockType === 'transfer-spl') {
      return {
        ...block,
        tokenMint: useDaoDefaultPubkey(block.tokenMint, communityMint),
        fromTokenAccount: useDaoDefaultPubkey(block.fromTokenAccount),
        toTokenAccount: useDaoDefaultPubkey(block.toTokenAccount),
      };
    }

    if (blockType === 'set-governance-config') {
      return {
        ...block,
        governanceAddress: useDaoDefaultPubkey(block.governanceAddress, governanceAddress),
      };
    }

    if (blockType === 'program-upgrade') {
      return {
        ...block,
        spillAddress: useDaoDefaultPubkey(block.spillAddress, nativeTreasuryAddress),
      };
    }

    if (blockType === 'create-token-account') {
      return {
        ...block,
        payer: useDaoDefaultPubkey(block.payer, nativeTreasuryAddress),
        owner: useDaoDefaultPubkey(block.owner, nativeTreasuryAddress),
        mint: useDaoDefaultPubkey(block.mint, communityMint),
      };
    }

    if (blockType === 'create-stream') {
      return {
        ...block,
        tokenMint: useDaoDefaultPubkey(block.tokenMint, communityMint),
      };
    }

    return block;
  };

  const addBlock = (type: SupportedBlockType): void => {
    const nextBlock = applyDaoDefaultsToBlock(defaultBlockForType(type));
    const nextBlockId = getString(nextBlock.id);

    setBlocks((current) => [...current, nextBlock]);
    setGraphNodes((current) => {
      const position = getDefaultNodePosition(current.length);
      return [...current, { id: nextBlockId, x: position.x, y: position.y }];
    });
    setNodeWidths((current) => ({
      ...current,
      [nextBlockId]: defaultNodeWidth,
    }));

    markDirty();
  };

  const removeBlock = (blockId: string): void => {
    setBlocks((current) => current.filter((block) => getString(block.id) !== blockId));
    setGraphNodes((current) => current.filter((node) => node.id !== blockId));
    setGraphEdges((current) => current.filter((edge) => edge.source !== blockId && edge.target !== blockId));
    setNodeWidths((current) => {
      const next = { ...current };
      delete next[blockId];
      return next;
    });
    markDirty();
  };

  const removeEdge = (edgeId: string): void => {
    setGraphEdges((current) => current.filter((edge) => edge.id !== edgeId));
    markDirty();
  };

  const changeBlockType = (blockId: string, nextType: SupportedBlockType): void => {
    setBlocks((current) =>
      current.map((block) => {
        if (getString(block.id) !== blockId) {
          return block;
        }

        const next = applyDaoDefaultsToBlock(defaultBlockForType(nextType));
        return {
          ...next,
          id: blockId,
          label: getString(block.label, getString(next.label)),
          uiWidth: getNumber(block.uiWidth, getNodeWidth(blockId)),
        };
      }),
    );

    markDirty();
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

    markDirty();
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

    if (type === 'create-token-account') {
      return (
        <div className="form-grid two-col">
          <label className="input-label">
            Payer (signer)
            <input className="text-input" value={getString(block.payer)} onChange={(event) => setBlockField(blockId, 'payer', event.target.value)} />
          </label>
          <label className="input-label">
            Owner
            <input className="text-input" value={getString(block.owner)} onChange={(event) => setBlockField(blockId, 'owner', event.target.value)} />
          </label>
          <label className="input-label">
            Token mint
            <input className="text-input" value={getString(block.mint)} onChange={(event) => setBlockField(blockId, 'mint', event.target.value)} />
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

  const handleNodeResize = (blockId: string, width: number): void => {
    const nextWidth = clamp(width, minNodeWidth, maxNodeWidth);

    setNodeWidths((current) => ({
      ...current,
      [blockId]: nextWidth,
    }));
    markDirty();
  };

  const handleNodesChange = (changes: NodeChange[]): void => {
    let didMutateGraph = false;
    let didResize = false;
    const widthUpdates: Record<string, number> = {};

    setGraphNodes((current) => {
      let next = current;

      changes.forEach((change) => {
        if (change.type === 'position' && change.position) {
          didMutateGraph = true;
          next = next.map((node) =>
            node.id === change.id
              ? {
                  ...node,
                  x: Math.max(0, change.position?.x ?? node.x),
                  y: Math.max(0, change.position?.y ?? node.y),
                }
              : node,
          );
        }

        if (change.type === 'dimensions' && change.dimensions?.width) {
          didResize = true;
          widthUpdates[change.id] = clamp(change.dimensions.width, minNodeWidth, maxNodeWidth);
        }
      });

      return next;
    });

    if (didResize) {
      setNodeWidths((current) => ({
        ...current,
        ...widthUpdates,
      }));
    }

    if (didMutateGraph || didResize) {
      markDirty();
    }
  };

  const handleEdgesChange = (changes: EdgeChange[]): void => {
    const removedIds = changes.filter((change) => change.type === 'remove').map((change) => change.id);

    if (removedIds.length === 0) {
      return;
    }

    setGraphEdges((current) => current.filter((edge) => !removedIds.includes(edge.id)));
    markDirty();
  };

  const handleConnect = (connection: Connection): void => {
    const sourceId = connection.source ?? '';
    const targetId = connection.target ?? '';

    if (!sourceId || !targetId || sourceId === targetId) {
      return;
    }

    setGraphEdges((current) => {
      if (current.some((edge) => edge.source === sourceId && edge.target === targetId)) {
        return current;
      }

      return [...current, { id: makeEdgeId(sourceId, targetId, current.length), source: sourceId, target: targetId }];
    });
    markDirty();
  };

  const reactFlowNodes: Array<Node<FlowBlockNodeData>> = blocks.map((block, index) => {
    const blockId = getString(block.id, makeBlockId());
    const graphNode = graphNodeMap.get(blockId) ?? getDefaultNodePosition(index);
    const blockType = getString(block.type, 'transfer-sol') as SupportedBlockType;

    return {
      id: blockId,
      type: 'flowBlock',
      position: { x: graphNode.x, y: graphNode.y },
      style: { width: getNodeWidth(blockId) },
      data: {
        block,
        blockType,
        orderIndex: orderingPreview.ids.findIndex((id) => id === blockId) + 1,
        onRemove: removeBlock,
        onChangeType: changeBlockType,
        onChangeField: setBlockField,
        onResizeWidth: handleNodeResize,
        renderFields: renderNodeFields,
      },
    };
  });

  const reactFlowEdges: Edge[] = graphEdges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: 'smoothstep',
  }));

  if (isLoadingFlow) {
    return <p className="hint-text">Loading flow builder...</p>;
  }

  return (
    <section className="flow-builder-shell">
      <article className="flow-step-card">
        <div className="flow-stepper">
          <button
            type="button"
            className={`flow-stepper-item ${activeStep === 'builder' ? 'flow-stepper-item-active' : ''}`}
            onClick={() => setActiveStep('builder')}
          >
            1. Builder
          </button>
          <button
            type="button"
            className={`flow-stepper-item ${activeStep === 'compile' ? 'flow-stepper-item-active' : ''}`}
            onClick={() => setActiveStep('compile')}
          >
            2. Compile
          </button>
          <button
            type="button"
            className={`flow-stepper-item ${activeStep === 'publish' ? 'flow-stepper-item-active' : ''}`}
            onClick={() => setActiveStep('publish')}
          >
            3. Publish
          </button>
        </div>
      </article>

      {activeStep === 'builder' ? (
        <article className="flow-step-card">
          <header className="flow-step-head">
            <div className="flow-step-head-main">
              <div>
                <h2>{flowName}</h2>
                <p>{flowDescription || 'No description'}</p>
              </div>
            </div>
            <span className="hint-text flow-builder-save-meta">
              {lastSavedAt ? `${saveStateLabel} • ${formatDateTime(lastSavedAt)}` : `${saveStateLabel} • Not saved yet`}
            </span>
          </header>

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

          {orderingPreview.error ? <p className="error-text">{orderingPreview.error}</p> : null}
          <p className="hint-text">Drag nodes to arrange. Connect side handles. Resize selected nodes.</p>

          <div className="flow-canvas-shell">
            <div className="flow-canvas-flow">
              <ReactFlow
                nodes={reactFlowNodes}
                edges={reactFlowEdges}
                nodeTypes={flowNodeTypes}
                onNodesChange={handleNodesChange}
                onEdgesChange={handleEdgesChange}
                onConnect={handleConnect}
                defaultViewport={{ x: 0, y: 0, zoom: 1 }}
                minZoom={0.45}
                maxZoom={1.5}
                proOptions={{ hideAttribution: true }}
                deleteKeyCode={null}
                selectionOnDrag={false}
              >
                <Background gap={20} size={2} color="#d9d9d9" />
                <Controls position="bottom-right" />
              </ReactFlow>
            </div>
          </div>

          {graphEdges.length > 0 ? (
            <div className="flow-edge-list">
              <p className="hint-text">Links</p>
              {graphEdges.map((edge) => (
                <div key={edge.id} className="flow-edge-item">
                  <span>
                    {edge.source.slice(0, 6)}... to {edge.target.slice(0, 6)}...
                  </span>
                  <button type="button" className="secondary-button flow-node-mini" onClick={() => removeEdge(edge.id)}>
                    Remove link
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <div className="button-row">
            <button
              type="button"
              className="primary-button"
              onClick={() => setActiveStep('compile')}
              disabled={isAutoSaving}
            >
              Next: Compile
            </button>
          </div>
        </article>
      ) : null}

      {activeStep === 'compile' ? (
      <article className="flow-step-card">
        <header className="flow-step-head">
          <span className="flow-step-index">Compile</span>
          <div>
            <h2>Compile Flow</h2>
            <p>Compile validates block links and calculates risk.</p>
          </div>
        </header>

        <label className="input-label">
          Context JSON (optional)
          <textarea
            className="text-input code-input"
            value={compileContextJson}
            onChange={(event) => setCompileContextJson(event.target.value)}
            rows={5}
          />
        </label>

        <div className="button-row">
          <button type="button" className="primary-button" onClick={() => void handleCompile()} disabled={isCompiling || isAutoSaving}>
            {isCompiling ? 'Compiling...' : 'Compile'}
          </button>
        </div>

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
          <p className="hint-text">Compile before publishing.</p>
        )}

        <div className="button-row">
          <button type="button" className="secondary-button" onClick={() => setActiveStep('builder')}>
            Back: Builder
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => setActiveStep('publish')}
            disabled={!compileResult}
          >
            Next: Publish
          </button>
        </div>
      </article>
      ) : null}

      {activeStep === 'publish' ? (
      <article className="flow-step-card">
        <header className="flow-step-head">
          <span className="flow-step-index">Publish</span>
          <div>
            <h2>Publish Proposal</h2>
            <p>Create a proposal record and optionally create/sign-off on-chain in Realms.</p>
          </div>
        </header>

        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={publishOnchainNow}
            onChange={(event) => setPublishOnchainNow(event.target.checked)}
          />
          Publish on-chain now
        </label>

        {publishOnchainNow ? (
          <div className="form-grid two-col">
            <label className="input-label">
              Realm address
              <input
                className="text-input"
                value={publishRealmAddress}
                onChange={(event) => setPublishRealmAddress(event.target.value)}
              />
            </label>
            <label className="input-label">
              Governance program ID
              <input
                className="text-input"
                value={publishGovernanceProgramId}
                onChange={(event) => setPublishGovernanceProgramId(event.target.value)}
              />
            </label>
            <label className="input-label">
              Governance account
              <input
                className="text-input"
                value={publishGovernanceAddress}
                onChange={(event) => setPublishGovernanceAddress(event.target.value)}
                readOnly={!publishUseGovernanceOverride}
                placeholder={
                  isLoadingDaoContext
                    ? 'Loading governance accounts...'
                    : 'Set DAO default governance to auto-fill'
                }
              />
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={publishUseGovernanceOverride}
                  onChange={(event) => {
                    const nextChecked = event.target.checked;
                    setPublishUseGovernanceOverride(nextChecked);

                    if (!nextChecked) {
                      const defaultAddress =
                        daoContext?.defaultGovernanceAddress ??
                        (governanceOptions.length === 1 ? governanceOptions[0].address : '');
                      setPublishGovernanceAddress(defaultAddress);
                    } else if (!publishGovernanceAddress && governanceOptions[0]?.address) {
                      setPublishGovernanceAddress(governanceOptions[0].address);
                    }
                  }}
                  disabled={governanceOptions.length === 0}
                />
                Override governance account
              </label>
              {publishUseGovernanceOverride ? (
                <select
                  className="select-input"
                  value={publishGovernanceAddress}
                  onChange={(event) => setPublishGovernanceAddress(event.target.value)}
                  disabled={isLoadingDaoContext || governanceOptions.length === 0}
                >
                  {governanceOptions.length === 0 ? (
                    <option value="">
                      {isLoadingDaoContext ? 'Loading governance accounts...' : 'No governance accounts found'}
                    </option>
                  ) : null}
                  {governanceOptions.map((item) => (
                    <option key={item.address} value={item.address}>
                      {item.address}
                    </option>
                  ))}
                </select>
              ) : null}
            </label>
            <label className="input-label">
              Governing token mint
              <input
                className="text-input"
                value={publishGoverningTokenMint}
                onChange={(event) => setPublishGoverningTokenMint(event.target.value)}
              />
            </label>
          </div>
        ) : null}

        {publishOnchainNow && daoContext ? (
          <div className="dao-card-actions">
            <a
              className="secondary-button"
              href={`https://app.realms.today/dao/${daoContext.realmAddress}${daoContext.network === 'devnet' ? '?cluster=devnet' : ''}`}
              target="_blank"
              rel="noreferrer"
            >
              Open DAO in Realms
            </a>
          </div>
        ) : null}

        <div className="button-row">
          <button type="button" className="secondary-button" onClick={() => setActiveStep('compile')}>
            Back: Compile
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => void handlePublish()}
            disabled={!compileResult || isPublishing || isDirty || isAutoSaving}
          >
            {isPublishing ? 'Publishing...' : 'Publish'}
          </button>
        </div>

        {isDirty ? <p className="hint-text">Waiting for auto-save before publish...</p> : null}
        {!compileResult ? <p className="error-text">Compile is required before publish.</p> : null}

        {lastPublishResult ? (
          <div className="result-shell">
            <p>
              Proposal ID: <strong>{lastPublishResult.proposalId}</strong>
            </p>
            <p>Flow status: {lastPublishResult.flow.status}</p>
            <p>
              Proposal monitor: <a href="/dashboard/proposals">Open Proposals page</a>
            </p>
            {lastPublishResult.onchainPreparation ? (
              <>
                <p>Prepared on-chain transactions: {lastPublishResult.onchainPreparation.preparedTransactions.length}</p>
                <p>On-chain proposal: {lastPublishResult.onchainPreparation.proposalAddress}</p>
              </>
            ) : null}
            <p>Updated at: {formatDateTime(lastPublishResult.flow.updatedAt)}</p>
          </div>
        ) : (
          <p className="hint-text">No publish action yet.</p>
        )}
      </article>
      ) : null}

      {error ? <p className="error-text">{error}</p> : null}
      {success ? <p className="success-text">{success}</p> : null}
    </section>
  );
};
