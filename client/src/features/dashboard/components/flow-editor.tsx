import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  compileFlowById,
  createFlowBlock,
  deleteFlowBlock,
  getDaoById,
  getDaoGovernances,
  getFlowBlocks,
  getFlowById,
  publishFlow,
  updateFlowBlock,
  updateProposalOnchainExecution,
  type DaoGovernanceItem,
  type DaoItem,
  type FlowBlockItem,
  type FlowBlockInput,
  type FlowCompilationResult,
  type FlowGraphEdge,
  type FlowGraphNode,
  type PublishFlowResult,
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
  useNodesState,
  useEdgesState,
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
const defaultRpcByNetwork: Record<'mainnet-beta' | 'devnet', string> = {
  'mainnet-beta': 'https://api.mainnet-beta.solana.com',
  devnet: 'https://api.devnet.solana.com',
};

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
  onSelect: (blockId: string) => void;
  onRemove: (blockId: string) => void;
  onResizeWidth: (blockId: string, width: number) => void;
};

const FlowBlockNode = memo(({ id, data, selected }: NodeProps<FlowBlockNodeData>): JSX.Element => {
  const blockId = getBlockId(data.block) || id;
  const stopCanvasEvent = (event: { stopPropagation: () => void }): void => {
    event.stopPropagation();
  };

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
      <div
        className={`flow-block-node ${selected ? 'selected' : ''}`}
      >
        <div className="flow-node-header">
          <div className="flow-node-title">
            <strong>{getString(data.block.label, 'Untitled block')}</strong>
          </div>

          <div
            className="flow-node-actions nodrag nopan nowheel"
            onMouseDown={stopCanvasEvent}
            onPointerDown={stopCanvasEvent}
            onClick={stopCanvasEvent}
          >
            <button
              type="button"
              className="flow-node-remove nodrag"
              onClick={() => data.onRemove(blockId)}
              aria-label="Remove block"
            >
              X
            </button>
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Right} />
    </>
  );
});

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

const inflateBlockForEditor = (block: FlowBlockInput): FlowBlockInput => {
  if (getString(block.type) !== 'custom-instruction') {
    return block;
  }

  const accounts = Array.isArray(block.accounts)
    ? block.accounts
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return '';
        }

        return getString((entry as { pubkey?: string }).pubkey);
      })
      .filter(Boolean)
    : [];

  return {
    ...block,
    accountsCsv: accounts.join(', '),
  };
};

const deriveDraftFromPersistedBlocks = (
  items: FlowBlockItem[],
): {
  blocks: FlowBlockInput[];
  graphNodes: FlowGraphNode[];
  graphEdges: FlowGraphEdge[];
  nodeWidths: Record<string, number>;
} => {
  const sorted = [...items].sort((left, right) => left.orderIndex - right.orderIndex);
  const blocks = sorted.map((item) => inflateBlockForEditor(item.config));
  const graphNodes = sorted.map((item) => ({
    id: item.blockId,
    x: item.position.x,
    y: item.position.y,
  }));
  const edgeKeys = new Set<string>();
  const graphEdges = sorted.flatMap((item, itemIndex) =>
    item.dependencies.flatMap((dependency, dependencyIndex) => {
      const edgeKey = `${dependency.sourceBlockId}->${item.blockId}`;

      if (edgeKeys.has(edgeKey)) {
        return [];
      }

      edgeKeys.add(edgeKey);

      return [
        {
          id: makeEdgeId(dependency.sourceBlockId, item.blockId, itemIndex + dependencyIndex),
          source: dependency.sourceBlockId,
          target: item.blockId,
        },
      ];
    }),
  );
  const nodeWidths = Object.fromEntries(
    sorted.map((item) => [item.blockId, clamp(item.uiWidth, minNodeWidth, maxNodeWidth)]),
  );

  return {
    blocks,
    graphNodes,
    graphEdges,
    nodeWidths,
  };
};

const topologicalSortBlocks = (blocks: FlowBlockInput[], edges: FlowGraphEdge[]): FlowBlockInput[] => {
  const blockIds = blocks.map((block) => getBlockId(block));
  const blockMap = new Map(blocks.map((block) => [getBlockId(block), block]));
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

const getBlockId = (block: FlowBlockInput): string => {
  const explicitId = getString(block.id).trim();

  if (explicitId.length > 0) {
    return explicitId;
  }

  const legacyId = getString(block._id).trim();
  return legacyId;
};

const ensureStableBlockId = (block: FlowBlockInput): FlowBlockInput => {
  const resolvedId = getBlockId(block) || makeBlockId();

  if (getString(block.id).trim() === resolvedId) {
    return block;
  }

  return {
    ...block,
    id: resolvedId,
  };
};

type FlowEditorProps = {
  accessToken: string;
  flowId: string;
  onFlowPublished: (result: PublishFlowResult) => void;
};

type EditorStep = 'builder' | 'compile' | 'publish';

export const FlowEditor = ({ accessToken, flowId, onFlowPublished }: FlowEditorProps): JSX.Element => {
  const [activeStep, setActiveStep] = useState<EditorStep>('builder');
  const [flowName, setFlowName] = useState('');
  const [flowDescription, setFlowDescription] = useState('');
  const [flowDaoId, setFlowDaoId] = useState('');
  const [daoContext, setDaoContext] = useState<DaoItem | null>(null);
  const [governanceOptions, setGovernanceOptions] = useState<DaoGovernanceItem[]>([]);
  const [isLoadingDaoContext, setIsLoadingDaoContext] = useState(false);
  const [isLoadingFlow, setIsLoadingFlow] = useState(true);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const [isCompiling, setIsCompiling] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [blocks, setBlocks] = useState<FlowBlockInput[]>([]);
  const [nodes, setNodes, onNodesChangeReactFlow] = useNodesState<FlowBlockNodeData>([]);
  const [edges, setEdges, onEdgesChangeReactFlow] = useEdgesState<Edge>([]);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

  const [configForm, setConfigForm] = useState<Record<string, unknown>>({});

  const [compileContextJson, setCompileContextJson] = useState('{}');
  const [compileResult, setCompileResult] = useState<FlowCompilationResult | null>(null);
  const [lastPublishResult, setLastPublishResult] = useState<PublishFlowResult | null>(null);
  const [publishOnchainNow, setPublishOnchainNow] = useState(true);
  const [publishRealmAddress, setPublishRealmAddress] = useState('');
  const [publishGovernanceProgramId, setPublishGovernanceProgramId] = useState('');
  const [publishGovernanceAddress, setPublishGovernanceAddress] = useState('');
  const [publishGoverningTokenMint, setPublishGoverningTokenMint] = useState('');
  const [publishUseGovernanceOverride, setPublishUseGovernanceOverride] = useState(false);

  const selectedGovernance = useMemo(
    () => governanceOptions.find((item) => item.address === publishGovernanceAddress) ?? null,
    [governanceOptions, publishGovernanceAddress],
  );
  const saveStateLabel = isAutoSaving ? 'Saving...' : 'Saved';

  const orderingPreview = useMemo(() => {
    try {
      return {
        ids: topologicalSortBlocks(blocks, edges as FlowGraphEdge[]).map((block) => getBlockId(block)),
        error: null,
      };
    } catch (orderingError) {
      return {
        ids: blocks.map((block) => getBlockId(block)),
        error: orderingError instanceof Error ? orderingError.message : 'Invalid links',
      };
    }
  }, [blocks, edges]);

  const selectedBlock = useMemo(
    () => blocks.find((block) => getBlockId(block) === selectedBlockId) ?? null,
    [blocks, selectedBlockId],
  );

  useEffect(() => {
    if (selectedBlock) {
      setConfigForm({ ...selectedBlock });
    } else {
      setConfigForm({});
    }
  }, [selectedBlock]);

  const handleSelectBlock = useCallback((blockId: string): void => {
    setSelectedBlockId(blockId);
  }, []);

  const hydrateFlowBlocks = useCallback(async (): Promise<void> => {
    const persistedBlocks = await getFlowBlocks(flowId, accessToken);
    const draft = deriveDraftFromPersistedBlocks(persistedBlocks);

    setBlocks(draft.blocks);

    // Convert to robust ReactFlow node state immediately
    const initialNodes: Node<FlowBlockNodeData>[] = draft.blocks.map((block, index) => {
      const blockId = getBlockId(block) || `legacy-block-${index}`;
      const graphNode = draft.graphNodes.find(n => n.id === blockId) ?? getDefaultNodePosition(index);
      return {
        id: blockId,
        type: 'flowBlock',
        position: { x: graphNode.x, y: graphNode.y },
        style: { width: draft.nodeWidths[blockId] ?? defaultNodeWidth },
        data: {
          block,
          blockType: getString(block.type, 'transfer-sol') as SupportedBlockType,
          onSelect: handleSelectBlock,
          onRemove: removeBlock,
          onResizeWidth: handleNodeResize,
        }
      };
    });
    setNodes(initialNodes);
    setEdges(draft.graphEdges.map((e: FlowGraphEdge) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'smoothstep'
    })));
  }, [accessToken, flowId]); // We omit onRemove / handleNodeResize from deps to avoid looping, they use refs natively or are stable.

  const runPersistedMutation = useCallback(
    async (
      operation: () => Promise<void>,
      options: {
        refreshDraft?: boolean;
        invalidateCompilation?: boolean;
      } = {},
    ): Promise<void> => {
      setIsAutoSaving(true);

      try {
        await operation();

        if (options.refreshDraft) {
          await hydrateFlowBlocks();
        }

        if (options.invalidateCompilation !== false) {
          setCompileResult(null);
        }

        setLastSavedAt(new Date().toISOString());
      } catch (mutationError) {
        setError(mutationError instanceof Error ? mutationError.message : 'Unable to save builder changes');
        try {
          await hydrateFlowBlocks();
        } catch {
          // Keep the original mutation error visible.
        }
      } finally {
        setIsAutoSaving(false);
      }
    },
    [hydrateFlowBlocks],
  );

  const hydrateFlow = async (): Promise<void> => {
    setIsLoadingFlow(true);
    setError(null);

    try {
      const flow = await getFlowById(flowId);
      const persistedBlocks = await getFlowBlocks(flowId, accessToken);
      const draft = deriveDraftFromPersistedBlocks(persistedBlocks);

      setFlowName(flow.name);
      setFlowDescription(flow.description ?? '');
      setFlowDaoId(flow.daoId);
      setBlocks(draft.blocks);

      const initialNodes: Node<FlowBlockNodeData>[] = draft.blocks.map((block, index) => {
        const blockId = getBlockId(block) || `legacy-block-${index}`;
        const graphNode = draft.graphNodes.find(n => n.id === blockId) ?? getDefaultNodePosition(index);
        return {
          id: blockId,
          type: 'flowBlock',
          position: { x: graphNode.x, y: graphNode.y },
          style: { width: draft.nodeWidths[blockId] ?? defaultNodeWidth },
          data: {
            block,
            blockType: getString(block.type, 'transfer-sol') as SupportedBlockType,
            onSelect: handleSelectBlock,
            onRemove: removeBlock,
            onResizeWidth: handleNodeResize,
          }
        };
      });
      setNodes(initialNodes);
      setEdges(draft.graphEdges.map((e: FlowGraphEdge) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'smoothstep'
      })));
      setSelectedBlockId(null);
      setActiveStep('builder');
      setCompileResult(null);
      setLastPublishResult(null);
      setSuccess(null);
      setLastSavedAt(flow.updatedAt);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load flow');
    } finally {
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

  const normalizeBlocksForApi = (items: FlowBlockInput[]): FlowBlockInput[] =>
    items.map((block) => {
      const normalizedBlock = ensureStableBlockId(block);
      const type = getString(normalizedBlock.type) as SupportedBlockType;

      if (type === 'transfer-sol') {
        return {
          ...normalizedBlock,
          type,
          label: getString(normalizedBlock.label, 'Treasury transfer'),
          lamports: getNumber(normalizedBlock.lamports, 0),
        };
      }

      if (type === 'transfer-spl') {
        return {
          ...normalizedBlock,
          type,
          label: getString(normalizedBlock.label, 'Token transfer'),
          amount: getString(normalizedBlock.amount, '0'),
          decimals: getNumber(normalizedBlock.decimals, 0),
        };
      }

      if (type === 'set-governance-config') {
        return {
          ...normalizedBlock,
          type,
          yesVoteThresholdPercent: getNumber(normalizedBlock.yesVoteThresholdPercent, 0),
          baseVotingTimeSeconds: getNumber(normalizedBlock.baseVotingTimeSeconds, 0),
          minInstructionHoldUpTimeSeconds: getNumber(normalizedBlock.minInstructionHoldUpTimeSeconds, 0),
          communityVetoThresholdPercent:
            normalizedBlock.communityVetoThresholdPercent === undefined
              ? undefined
              : getNumber(normalizedBlock.communityVetoThresholdPercent, 0),
        };
      }

      if (type === 'create-token-account') {
        return {
          ...normalizedBlock,
          type,
          label: getString(normalizedBlock.label, 'Create token account'),
        };
      }

      if (type === 'create-stream') {
        return {
          ...normalizedBlock,
          type,
          totalAmount: getString(normalizedBlock.totalAmount, '0'),
          canCancel: getBoolean(normalizedBlock.canCancel, true),
        };
      }

      if (type === 'custom-instruction') {
        const accountsCsv = getString(normalizedBlock.accountsCsv, '');
        const accounts = accountsCsv
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean)
          .map((pubkey) => ({ pubkey, isSigner: false, isWritable: false }));

        return {
          id: getBlockId(normalizedBlock),
          type,
          label: getString(normalizedBlock.label, 'Custom instruction'),
          programId: getString(normalizedBlock.programId),
          kind: getString(normalizedBlock.kind, 'custom'),
          dataBase64: getString(normalizedBlock.dataBase64),
          accounts,
        };
      }

      return {
        ...normalizedBlock,
        type,
      };
    });

  const handleCompile = async (): Promise<void> => {
    setError(null);
    setSuccess(null);
    setIsCompiling(true);

    try {
      const contextRaw = compileContextJson.trim();
      const context = contextRaw ? parseJson<Record<string, unknown>>(contextRaw, 'Compile context') : {};
      const result = await compileFlowById(flowId, context, accessToken);

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
          const publishRpcUrl =
            result.onchainPreparation.onchainExecution.rpcUrl ??
            (daoContext ? defaultRpcByNetwork[daoContext.network] : defaultRpcByNetwork.devnet);

          const signature = await sendPreparedTransaction(
            provider,
            prepared.transactionMessage,
            prepared.transactionBase58,
            prepared.transactionBase64,
            {
              rpcUrl: publishRpcUrl,
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
    const nextBlock = normalizeBlocksForApi([applyDaoDefaultsToBlock(defaultBlockForType(type))])[0];
    const nextBlockId = getBlockId(nextBlock);
    const position = getDefaultNodePosition(nodes.length);

    setSelectedBlockId(nextBlockId);
    setConfigForm({ ...nextBlock });

    setBlocks((current) => [...current, nextBlock]);
    setNodes((current) => [...current, { id: nextBlockId, type: 'flowBlock', position, style: { width: defaultNodeWidth }, data: { block: nextBlock, blockType: getString(nextBlock.type, 'transfer-sol') as SupportedBlockType, onSelect: handleSelectBlock, onRemove: removeBlock, onResizeWidth: handleNodeResize } }]);

    void runPersistedMutation(
      async () => {
        await createFlowBlock(
          flowId,
          {
            config: nextBlock,
            position,
            uiWidth: defaultNodeWidth,
            orderIndex: blocks.length,
          },
          accessToken,
        );
      },
      {
        refreshDraft: false,
      },
    );
  };

  const removeBlock = (blockId: string): void => {
    setSelectedBlockId((current) => (current === blockId ? null : current));

    setBlocks((current) => current.filter((block) => getBlockId(block) !== blockId));
    setNodes((current) => current.filter((node) => node.id !== blockId));
    setEdges((current) => current.filter((edge) => edge.source !== blockId && edge.target !== blockId));

    void runPersistedMutation(
      async () => {
        await deleteFlowBlock(flowId, blockId, accessToken);
      },
      {
        refreshDraft: false,
      },
    );
  };

  const buildDependenciesForTarget = useCallback(
    (targetId: string, edges: FlowGraphEdge[]): Array<{ sourceBlockId: string }> => {
      const seen = new Set<string>();

      return edges.flatMap((edge) => {
        if (edge.target !== targetId || seen.has(edge.source)) {
          return [];
        }

        seen.add(edge.source);
        return [{ sourceBlockId: edge.source }];
      });
    },
    [],
  );

  const persistDependencies = useCallback(
    (targetIds: string[], edges: FlowGraphEdge[]): void => {
      if (targetIds.length === 0) {
        return;
      }

      void runPersistedMutation(
        async () => {
          await Promise.all(
            [...new Set(targetIds)].map((targetId) =>
              updateFlowBlock(
                flowId,
                targetId,
                {
                  dependencies: buildDependenciesForTarget(targetId, edges),
                },
                accessToken,
              ),
            ),
          );
        },
        {
          refreshDraft: false,
        },
      );
    },
    [accessToken, buildDependenciesForTarget, flowId, runPersistedMutation],
  );

  const removeEdge = (edgeId: string): void => {
    const removedEdge = edges.find((edge) => edge.id === edgeId);
    if (!removedEdge) return;
    const nextEdges = edges.filter((edge) => edge.id !== edgeId);
    setEdges(nextEdges);
    persistDependencies([removedEdge.target], nextEdges as FlowGraphEdge[]);
  };
  const changeBlockType = useCallback((blockId: string, nextType: SupportedBlockType): void => {
    const currentBlock = blocks.find((block) => getBlockId(block) === blockId);

    if (!currentBlock) {
      return;
    }

    const next = applyDaoDefaultsToBlock(defaultBlockForType(nextType));
    const nextConfig = normalizeBlocksForApi([
      {
        ...next,
        id: blockId,
        label: getString(currentBlock.label, getString(next.label)),
      },
    ])[0];

    setConfigForm({ ...inflateBlockForEditor(nextConfig) });
    setBlocks((current) => current.map((block) => getBlockId(block) === blockId ? nextConfig : block));
    setNodes((current) => current.map((node) => node.id === blockId ? { ...node, data: { ...node.data, block: nextConfig, blockType: getString(nextConfig.type, 'transfer-sol') as SupportedBlockType } } : node));

    void runPersistedMutation(
      async () => {
        await updateFlowBlock(
          flowId,
          blockId,
          {
            config: nextConfig,
          },
          accessToken,
        );
      },
      {
        refreshDraft: false,
      },
    );
  }, [accessToken, blocks, flowId, runPersistedMutation]);

  const setConfigField = useCallback((field: string, value: unknown): void => {
    setConfigForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const saveConfigToBlock = useCallback((): void => {
    if (!selectedBlockId) {
      return;
    }

    const nextConfig = normalizeBlocksForApi([
      {
        ...(configForm as FlowBlockInput),
        id: selectedBlockId,
      },
    ])[0];

    setConfigForm({ ...inflateBlockForEditor(nextConfig) });
    setBlocks((current) => current.map((block) => getBlockId(block) === selectedBlockId ? nextConfig : block));
    setNodes((current) => current.map((node) => node.id === selectedBlockId ? { ...node, data: { ...node.data, block: nextConfig, blockType: getString(nextConfig.type, 'transfer-sol') as SupportedBlockType } } : node));
    setSelectedBlockId(null);

    void runPersistedMutation(
      async () => {
        await updateFlowBlock(
          flowId,
          selectedBlockId,
          {
            config: nextConfig,
          },
          accessToken,
        );
      },
      {
        refreshDraft: false,
      },
    );
  }, [accessToken, configForm, flowId, runPersistedMutation, selectedBlockId]);

  const renderConfigFields = useCallback((): JSX.Element | null => {
    const type = getString(configForm.type) as SupportedBlockType;

    if (type === 'transfer-sol') {
      return (
        <div className="form-grid two-col">
          <label className="input-label">
            From governance
            <input className="text-input" value={getString(configForm.fromGovernance)} onChange={(event) => setConfigField('fromGovernance', event.target.value)} />
          </label>
          <label className="input-label">
            To wallet
            <input className="text-input" value={getString(configForm.toWallet)} onChange={(event) => setConfigField('toWallet', event.target.value)} />
          </label>
          <label className="input-label">
            Lamports
            <input className="text-input" type="number" min={0} value={getNumber(configForm.lamports, 0)} onChange={(event) => setConfigField('lamports', Number(event.target.value))} />
          </label>
        </div>
      );
    }

    if (type === 'transfer-spl') {
      return (
        <div className="form-grid two-col">
          <label className="input-label">
            Token mint
            <input className="text-input" value={getString(configForm.tokenMint)} onChange={(event) => setConfigField('tokenMint', event.target.value)} />
          </label>
          <label className="input-label">
            Amount
            <input className="text-input" value={getString(configForm.amount, '0')} onChange={(event) => setConfigField('amount', event.target.value)} />
          </label>
          <label className="input-label">
            From token account
            <input className="text-input" value={getString(configForm.fromTokenAccount)} onChange={(event) => setConfigField('fromTokenAccount', event.target.value)} />
          </label>
          <label className="input-label">
            To token account
            <input className="text-input" value={getString(configForm.toTokenAccount)} onChange={(event) => setConfigField('toTokenAccount', event.target.value)} />
          </label>
          <label className="input-label">
            Decimals
            <input className="text-input" type="number" min={0} max={18} value={getNumber(configForm.decimals, 6)} onChange={(event) => setConfigField('decimals', Number(event.target.value))} />
          </label>
        </div>
      );
    }

    if (type === 'set-governance-config') {
      return (
        <div className="form-grid two-col">
          <label className="input-label">
            Governance address
            <input className="text-input" value={getString(configForm.governanceAddress)} onChange={(event) => setConfigField('governanceAddress', event.target.value)} />
          </label>
          <label className="input-label">
            Yes threshold (%)
            <input className="text-input" type="number" min={0} max={100} value={getNumber(configForm.yesVoteThresholdPercent, 60)} onChange={(event) => setConfigField('yesVoteThresholdPercent', Number(event.target.value))} />
          </label>
          <label className="input-label">
            Base voting time (sec)
            <input className="text-input" type="number" min={0} value={getNumber(configForm.baseVotingTimeSeconds, 259200)} onChange={(event) => setConfigField('baseVotingTimeSeconds', Number(event.target.value))} />
          </label>
          <label className="input-label">
            Hold-up time (sec)
            <input className="text-input" type="number" min={0} value={getNumber(configForm.minInstructionHoldUpTimeSeconds, 0)} onChange={(event) => setConfigField('minInstructionHoldUpTimeSeconds', Number(event.target.value))} />
          </label>
        </div>
      );
    }

    if (type === 'program-upgrade') {
      return (
        <div className="form-grid two-col">
          <label className="input-label">
            Program ID
            <input className="text-input" value={getString(configForm.programId)} onChange={(event) => setConfigField('programId', event.target.value)} />
          </label>
          <label className="input-label">
            Buffer address
            <input className="text-input" value={getString(configForm.bufferAddress)} onChange={(event) => setConfigField('bufferAddress', event.target.value)} />
          </label>
          <label className="input-label">
            Spill address
            <input className="text-input" value={getString(configForm.spillAddress)} onChange={(event) => setConfigField('spillAddress', event.target.value)} />
          </label>
        </div>
      );
    }

    if (type === 'create-token-account') {
      return (
        <div className="form-grid two-col">
          <label className="input-label">
            Payer (signer)
            <input className="text-input" value={getString(configForm.payer)} onChange={(event) => setConfigField('payer', event.target.value)} />
          </label>
          <label className="input-label">
            Owner
            <input className="text-input" value={getString(configForm.owner)} onChange={(event) => setConfigField('owner', event.target.value)} />
          </label>
          <label className="input-label">
            Token mint
            <input className="text-input" value={getString(configForm.mint)} onChange={(event) => setConfigField('mint', event.target.value)} />
          </label>
        </div>
      );
    }

    if (type === 'create-stream') {
      return (
        <div className="form-grid two-col">
          <label className="input-label">
            Stream program ID
            <input className="text-input" value={getString(configForm.streamProgramId)} onChange={(event) => setConfigField('streamProgramId', event.target.value)} />
          </label>
          <label className="input-label">
            Treasury token account
            <input className="text-input" value={getString(configForm.treasuryTokenAccount)} onChange={(event) => setConfigField('treasuryTokenAccount', event.target.value)} />
          </label>
          <label className="input-label">
            Recipient wallet
            <input className="text-input" value={getString(configForm.recipientWallet)} onChange={(event) => setConfigField('recipientWallet', event.target.value)} />
          </label>
          <label className="input-label">
            Token mint
            <input className="text-input" value={getString(configForm.tokenMint)} onChange={(event) => setConfigField('tokenMint', event.target.value)} />
          </label>
          <label className="input-label">
            Total amount
            <input className="text-input" value={getString(configForm.totalAmount, '0')} onChange={(event) => setConfigField('totalAmount', event.target.value)} />
          </label>
          <label className="input-label">
            Start at (ISO datetime)
            <input className="text-input" value={getString(configForm.startAt)} onChange={(event) => setConfigField('startAt', event.target.value)} />
          </label>
          <label className="input-label">
            End at (ISO datetime)
            <input className="text-input" value={getString(configForm.endAt)} onChange={(event) => setConfigField('endAt', event.target.value)} />
          </label>
          <label className="checkbox-field">
            <input type="checkbox" checked={getBoolean(configForm.canCancel, true)} onChange={(event) => setConfigField('canCancel', event.target.checked)} />
            Can cancel stream
          </label>
        </div>
      );
    }

    if (type === 'custom-instruction') {
      return (
        <div className="form-grid two-col">
          <label className="input-label">
            Program ID
            <input className="text-input" value={getString(configForm.programId)} onChange={(event) => setConfigField('programId', event.target.value)} />
          </label>
          <label className="input-label">
            Kind
            <select className="select-input" value={getString(configForm.kind, 'custom')} onChange={(event) => setConfigField('kind', event.target.value)}>
              <option value="custom">custom</option>
              <option value="defi">defi</option>
              <option value="governance">governance</option>
            </select>
          </label>
          <label className="input-label">
            Data (base64)
            <textarea className="text-input code-input" value={getString(configForm.dataBase64)} onChange={(event) => setConfigField('dataBase64', event.target.value)} rows={3} />
          </label>
          <label className="input-label">
            Accounts (comma-separated pubkeys)
            <textarea className="text-input code-input" value={getString(configForm.accountsCsv)} onChange={(event) => setConfigField('accountsCsv', event.target.value)} rows={3} />
          </label>
        </div>
      );
    }

    return null;
  }, [configForm, setConfigField]);

  const handleNodeResize = useCallback((blockId: string, width: number): void => {
    const nextWidth = clamp(width, minNodeWidth, maxNodeWidth);
    setNodes((current) => current.map((n) => n.id === blockId ? { ...n, style: { ...n.style, width: nextWidth } } : n));
    void runPersistedMutation(
      async () => {
        await updateFlowBlock(
          flowId,
          blockId,
          {
            uiWidth: nextWidth,
          },
          accessToken,
        );
      },
      {
        invalidateCompilation: false,
      },
    );
  }, [accessToken, flowId, runPersistedMutation]);

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    onNodesChangeReactFlow(changes);
    const persistedLayoutUpdates = new Map<string, { position?: { x: number; y: number }; uiWidth?: number }>();

    changes.forEach((change) => {
      // Persist after native ReactFlow logic executes smoothing
      if (change.type === 'position' && change.position && change.dragging === false) {
        persistedLayoutUpdates.set(change.id, {
          ...(persistedLayoutUpdates.get(change.id) ?? {}),
          position: { x: change.position.x, y: change.position.y },
        });
      }
      if (change.type === 'dimensions' && change.dimensions?.width && change.resizing === false) {
        persistedLayoutUpdates.set(change.id, {
          ...(persistedLayoutUpdates.get(change.id) ?? {}),
          uiWidth: clamp(change.dimensions.width, minNodeWidth, maxNodeWidth),
        });
      }
    });

    if (persistedLayoutUpdates.size > 0) {
      void runPersistedMutation(
        async () => {
          await Promise.all(
            [...persistedLayoutUpdates.entries()].map(([blockId, payload]) =>
              updateFlowBlock(flowId, blockId, payload, accessToken)
            )
          );
        },
        { invalidateCompilation: false }
      );
    }
  }, [onNodesChangeReactFlow, accessToken, flowId, runPersistedMutation]);

  const handleEdgesChange = (changes: EdgeChange[]): void => {
    onEdgesChangeReactFlow(changes);
    const removedIds = changes.filter((change) => change.type === 'remove').map((change) => change.id);
    if (removedIds.length === 0) return;
    const removedEdges = edges.filter((edge) => removedIds.includes(edge.id));
    const nextEdges = edges.filter((edge) => !removedIds.includes(edge.id));
    persistDependencies(removedEdges.map((edge) => edge.target), nextEdges as FlowGraphEdge[]);
  };

  const handleConnect = (connection: Connection): void => {
    const sourceId = connection.source ?? '';
    const targetId = connection.target ?? '';
    if (!sourceId || !targetId || sourceId === targetId) return;
    if (edges.some((edge) => edge.source === sourceId && edge.target === targetId)) return;

    const nextEdges = [...edges, { id: makeEdgeId(sourceId, targetId, edges.length), source: sourceId, target: targetId, type: 'smoothstep' }];
    setEdges(nextEdges);
    persistDependencies([targetId], nextEdges as FlowGraphEdge[]);
  };



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
                nodes={nodes}
                edges={edges}
                nodeTypes={flowNodeTypes}
                onNodesChange={handleNodesChange}
                onEdgesChange={handleEdgesChange}
                onConnect={handleConnect}
                onNodeClick={(_event, node) => handleSelectBlock(node.id)}
                onPaneClick={() => setSelectedBlockId(null)}
                nodesDraggable
                nodesConnectable
                elementsSelectable
                defaultViewport={{ x: 0, y: 0, zoom: 1 }}
                minZoom={0.45}
                maxZoom={1.5}
                proOptions={{ hideAttribution: true }}
                deleteKeyCode={null}
              >
                <Background gap={20} size={2} color="#d9d9d9" />
                <Controls position="bottom-right" showInteractive={false} />
              </ReactFlow>
            </div>

            <aside className="flow-config-panel">
              <div className="flow-config-panel-head">
                <div>
                  <p className="hint-text">Block Config</p>
                  <h3>{selectedBlock ? getString(selectedBlock.label, 'Untitled block') : 'No block selected'}</h3>
                </div>
                {selectedBlock ? (
                  <button
                    type="button"
                    className="secondary-button flow-node-mini"
                    onClick={() => removeBlock(getBlockId(selectedBlock))}
                  >
                    Remove
                  </button>
                ) : null}
              </div>

              {selectedBlock ? (
                <div className="flow-config-panel-body">
                  <div className="form-grid two-col">
                    <label className="input-label">
                      Label
                      <input
                        className="text-input"
                        value={getString(configForm.label)}
                        onChange={(event) => setConfigField('label', event.target.value)}
                      />
                    </label>
                    <label className="input-label">
                      Type
                      <select
                        className="select-input"
                        value={getString(configForm.type, 'transfer-sol')}
                        onChange={(event) =>
                          changeBlockType(getBlockId(selectedBlock), event.target.value as SupportedBlockType)
                        }
                      >
                        {supportedBlockTypes.map((typeItem) => (
                          <option key={typeItem.value} value={typeItem.value}>
                            {typeItem.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {renderConfigFields()}

                  <div className="button-row" style={{ marginTop: '0.5rem' }}>
                    <button type="button" className="primary-button" onClick={saveConfigToBlock}>
                      Save Configuration
                    </button>
                  </div>
                </div>
              ) : (
                <p className="hint-text">Click a block on the canvas to edit its configuration here.</p>
              )}
            </aside>
          </div>

          {edges.length > 0 ? (
            <div className="flow-edge-list">
              <p className="hint-text">Links</p>
              {edges.map((edge) => (
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
              disabled={!compileResult || isPublishing || isAutoSaving}
            >
              {isPublishing ? 'Publishing...' : 'Publish'}
            </button>
          </div>

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
