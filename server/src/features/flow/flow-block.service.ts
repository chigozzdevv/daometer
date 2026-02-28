import { Types } from 'mongoose';
import { FlowBlockModel, type FlowBlockDocument } from '@/features/flow/flow-block.model';
import { FlowModel, type FlowDocument } from '@/features/flow/flow.model';
import type { FlowBlock, FlowBlockDependency, FlowGraph, PersistedFlowBlock } from '@/features/flow/flow.types';
import { AppError } from '@/shared/errors/app-error';

const defaultNodeWidth = 360;
const minNodeWidth = 280;
const maxNodeWidth = 560;

type FlowBlockMutationInput = {
  config?: FlowBlock;
  position?: {
    x: number;
    y: number;
  };
  uiWidth?: number;
  dependencies?: FlowBlockDependency[];
  orderIndex?: number;
};

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

const ensureBlockId = (block: FlowBlock, fallback: string): FlowBlock => {
  if (typeof block.id === 'string' && block.id.trim().length > 0) {
    return block;
  }

  return {
    ...block,
    id: fallback,
  };
};

const toFlowBlock = (record: FlowBlockDocument): PersistedFlowBlock => ({
  blockId: record.blockId,
  config: ensureBlockId(record.config as FlowBlock, record.blockId),
  position: {
    x: Math.max(0, record.position.x),
    y: Math.max(0, record.position.y),
  },
  uiWidth: clamp(record.uiWidth, minNodeWidth, maxNodeWidth),
  dependencies: record.dependencies.map((dependency) => ({
    sourceBlockId: dependency.sourceBlockId,
  })),
  orderIndex: record.orderIndex,
});

const makeEdgeId = (sourceId: string, targetId: string, index: number): string =>
  `edge-${sourceId.slice(-4)}-${targetId.slice(-4)}-${index}`;

const buildSnapshot = (
  records: FlowBlockDocument[],
): {
  blocks: Array<FlowBlock & { uiWidth: number }>;
  graph: FlowGraph;
} => {
  const sorted = [...records].sort((left, right) => left.orderIndex - right.orderIndex);
  const blocks = sorted.map((record) => ({
    ...(toFlowBlock(record).config as FlowBlock),
    uiWidth: clamp(record.uiWidth, minNodeWidth, maxNodeWidth),
  }));

  const nodes = sorted.map((record) => ({
    id: record.blockId,
    x: Math.max(0, record.position.x),
    y: Math.max(0, record.position.y),
  }));

  const edgeKeys = new Set<string>();
  const edges = sorted.flatMap((record, recordIndex) =>
    record.dependencies.flatMap((dependency, dependencyIndex) => {
      const edgeKey = `${dependency.sourceBlockId}->${record.blockId}`;

      if (edgeKeys.has(edgeKey)) {
        return [];
      }

      edgeKeys.add(edgeKey);

      return [
        {
          id: makeEdgeId(dependency.sourceBlockId, record.blockId, recordIndex + dependencyIndex),
          source: dependency.sourceBlockId,
          target: record.blockId,
        },
      ];
    }),
  );

  return {
    blocks,
    graph: {
      nodes,
      edges,
    },
  };
};

const assertFlowOwner = (flow: FlowDocument, userId?: Types.ObjectId): void => {
  if (!userId) {
    return;
  }

  if (!flow.createdBy.equals(userId)) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }
};

const getOwnedFlow = async (flowId: string, userId?: Types.ObjectId): Promise<FlowDocument> => {
  const flow = await FlowModel.findById(flowId);

  if (!flow) {
    throw new AppError('Flow not found', 404, 'FLOW_NOT_FOUND');
  }

  assertFlowOwner(flow, userId);
  return flow;
};

const deriveLegacyDependencies = (targetBlockId: string, graph: FlowGraph | null): FlowBlockDependency[] => {
  if (!graph?.edges?.length) {
    return [];
  }

  const seen = new Set<string>();

  return graph.edges
    .filter((edge) => edge.target === targetBlockId && edge.source !== targetBlockId)
    .flatMap((edge) => {
      if (seen.has(edge.source)) {
        return [];
      }

      seen.add(edge.source);
      return [{ sourceBlockId: edge.source }];
    });
};

const normalizeDependencies = (
  dependencies: FlowBlockDependency[] | undefined,
  blockId: string,
): FlowBlockDependency[] => {
  const seen = new Set<string>();

  return (dependencies ?? [])
    .filter((dependency) => dependency.sourceBlockId && dependency.sourceBlockId !== blockId)
    .flatMap((dependency) => {
      const sourceBlockId = dependency.sourceBlockId.trim();

      if (!sourceBlockId || seen.has(sourceBlockId)) {
        return [];
      }

      seen.add(sourceBlockId);
      return [{ sourceBlockId }];
    });
};

export const syncFlowSnapshot = async (
  flowId: string,
  actorUserId: Types.ObjectId,
  options: {
    bumpVersion?: boolean;
    resetCompilation?: boolean;
  } = {},
): Promise<FlowDocument> => {
  const flow = await getOwnedFlow(flowId, actorUserId);
  const records = await FlowBlockModel.find({ flowId: flow._id }).sort({ orderIndex: 1, createdAt: 1 });
  const snapshot = buildSnapshot(records);

  flow.blocks = snapshot.blocks;
  flow.graph = snapshot.graph;

  if (options.bumpVersion) {
    flow.version += 1;
  }

  if (options.resetCompilation) {
    flow.latestCompilation = null;
  }

  flow.updatedBy = actorUserId;
  await flow.save();

  return flow;
};

const materializeLegacyBlocks = async (flow: FlowDocument): Promise<FlowBlockDocument[]> => {
  const existing = await FlowBlockModel.find({ flowId: flow._id }).sort({ orderIndex: 1, createdAt: 1 });

  if (existing.length > 0) {
    return existing;
  }

  const legacyBlocks = Array.isArray(flow.blocks) ? (flow.blocks as FlowBlock[]) : [];

  if (legacyBlocks.length === 0) {
    return [];
  }

  const nodeMap = new Map((flow.graph?.nodes ?? []).map((node) => [node.id, node]));
  const docs = legacyBlocks.map((block, index) => {
    const blockId =
      (typeof block.id === 'string' && block.id.trim().length > 0
        ? block.id.trim()
        : `legacy-block-${index + 1}`);

    return {
      flowId: flow._id,
      daoId: flow.daoId,
      blockId,
      type: block.type,
      config: ensureBlockId(block, blockId),
      position: nodeMap.get(blockId) ?? { x: 40 + (index % 3) * 420, y: 40 + Math.floor(index / 3) * 260 },
      uiWidth: clamp(Number((block as { uiWidth?: number }).uiWidth ?? defaultNodeWidth), minNodeWidth, maxNodeWidth),
      dependencies: deriveLegacyDependencies(blockId, flow.graph),
      orderIndex: index,
      createdBy: flow.createdBy,
      updatedBy: flow.updatedBy,
    };
  });

  await FlowBlockModel.insertMany(docs);
  return FlowBlockModel.find({ flowId: flow._id }).sort({ orderIndex: 1, createdAt: 1 });
};

export const getFlowBlockRecords = async (flowId: string, userId?: Types.ObjectId): Promise<FlowBlockDocument[]> => {
  const flow = await getOwnedFlow(flowId, userId);
  return materializeLegacyBlocks(flow);
};

export const listFlowBlocks = async (
  flowId: string,
  userId: Types.ObjectId,
): Promise<PersistedFlowBlock[]> => {
  const records = await getFlowBlockRecords(flowId, userId);
  return records.map((record) => toFlowBlock(record));
};

export const createFlowBlock = async (
  flowId: string,
  input: {
    config: FlowBlock;
    position?: {
      x: number;
      y: number;
    };
    uiWidth?: number;
    dependencies?: FlowBlockDependency[];
    orderIndex?: number;
  },
  userId: Types.ObjectId,
): Promise<PersistedFlowBlock> => {
  const flow = await getOwnedFlow(flowId, userId);
  const existing = await materializeLegacyBlocks(flow);
  const blockId = input.config.id.trim();
  const nextOrderIndex =
    input.orderIndex ?? (existing.length > 0 ? Math.max(...existing.map((record) => record.orderIndex)) + 1 : 0);

  const record = await FlowBlockModel.create({
    flowId: flow._id,
    daoId: flow.daoId,
    blockId,
    type: input.config.type,
    config: ensureBlockId(input.config, blockId),
    position: {
      x: Math.max(0, input.position?.x ?? 0),
      y: Math.max(0, input.position?.y ?? 0),
    },
    uiWidth: clamp(input.uiWidth ?? defaultNodeWidth, minNodeWidth, maxNodeWidth),
    dependencies: normalizeDependencies(input.dependencies, blockId),
    orderIndex: nextOrderIndex,
    createdBy: userId,
    updatedBy: userId,
  });

  await syncFlowSnapshot(flowId, userId, {
    bumpVersion: true,
    resetCompilation: true,
  });

  return toFlowBlock(record);
};

export const updateFlowBlock = async (
  flowId: string,
  blockId: string,
  input: FlowBlockMutationInput,
  userId: Types.ObjectId,
): Promise<PersistedFlowBlock> => {
  const flow = await getOwnedFlow(flowId, userId);
  await materializeLegacyBlocks(flow);

  const record = await FlowBlockModel.findOne({ flowId: flow._id, blockId });

  if (!record) {
    throw new AppError('Flow block not found', 404, 'FLOW_BLOCK_NOT_FOUND');
  }

  let isMaterialChange = false;

  if (input.config) {
    record.config = ensureBlockId(input.config, record.blockId);
    record.type = input.config.type;
    isMaterialChange = true;
  }

  if (input.position) {
    record.position = {
      x: Math.max(0, input.position.x),
      y: Math.max(0, input.position.y),
    };
  }

  if (input.uiWidth !== undefined) {
    record.uiWidth = clamp(input.uiWidth, minNodeWidth, maxNodeWidth);
  }

  if (input.dependencies) {
    record.dependencies = normalizeDependencies(input.dependencies, record.blockId);
    isMaterialChange = true;
  }

  if (input.orderIndex !== undefined && input.orderIndex !== record.orderIndex) {
    record.orderIndex = Math.max(0, input.orderIndex);
    isMaterialChange = true;
  }

  record.updatedBy = userId;
  await record.save();

  await syncFlowSnapshot(flowId, userId, {
    bumpVersion: isMaterialChange,
    resetCompilation: isMaterialChange,
  });

  return toFlowBlock(record);
};

export const deleteFlowBlock = async (flowId: string, blockId: string, userId: Types.ObjectId): Promise<void> => {
  const flow = await getOwnedFlow(flowId, userId);
  await materializeLegacyBlocks(flow);

  const deleted = await FlowBlockModel.findOneAndDelete({ flowId: flow._id, blockId });

  if (!deleted) {
    throw new AppError('Flow block not found', 404, 'FLOW_BLOCK_NOT_FOUND');
  }

  await FlowBlockModel.updateMany(
    {
      flowId: flow._id,
      'dependencies.sourceBlockId': blockId,
    },
    {
      $pull: {
        dependencies: {
          sourceBlockId: blockId,
        },
      },
      $set: {
        updatedBy: userId,
      },
    },
  );

  await syncFlowSnapshot(flowId, userId, {
    bumpVersion: true,
    resetCompilation: true,
  });
};

export const replaceFlowBlocksFromSnapshot = async (
  flow: FlowDocument,
  blocks: FlowBlock[],
  graph: FlowGraph | null,
  userId: Types.ObjectId,
  options: {
    bumpVersion?: boolean;
    resetCompilation?: boolean;
  } = {},
): Promise<void> => {
  await FlowBlockModel.deleteMany({ flowId: flow._id });

  if (blocks.length > 0) {
    const nodeMap = new Map((graph?.nodes ?? []).map((node) => [node.id, node]));
    const docs = blocks.map((block, index) => {
      const blockId = block.id.trim();

      return {
        flowId: flow._id,
        daoId: flow.daoId,
        blockId,
        type: block.type,
        config: ensureBlockId(block, blockId),
        position: nodeMap.get(blockId) ?? { x: 40 + (index % 3) * 420, y: 40 + Math.floor(index / 3) * 260 },
        uiWidth: clamp(Number((block as { uiWidth?: number }).uiWidth ?? defaultNodeWidth), minNodeWidth, maxNodeWidth),
        dependencies: normalizeDependencies(deriveLegacyDependencies(blockId, graph), blockId),
        orderIndex: index,
        createdBy: flow.createdBy,
        updatedBy: userId,
      };
    });

    await FlowBlockModel.insertMany(docs);
  }

  await syncFlowSnapshot(flow.id, userId, {
    bumpVersion: options.bumpVersion,
    resetCompilation: options.resetCompilation,
  });
};

export const getOrderedFlowBlocksForExecution = async (
  flowId: string,
  userId?: Types.ObjectId,
): Promise<FlowBlock[]> => {
  const records = await getFlowBlockRecords(flowId, userId);
  const sorted = [...records].sort((left, right) => left.orderIndex - right.orderIndex);
  const recordMap = new Map(sorted.map((record) => [record.blockId, record]));
  const adjacency = new Map<string, Set<string>>();
  const inDegree = new Map<string, number>();
  const orderMap = new Map(sorted.map((record) => [record.blockId, record.orderIndex]));

  sorted.forEach((record) => {
    adjacency.set(record.blockId, new Set<string>());
    inDegree.set(record.blockId, 0);
  });

  sorted.forEach((record) => {
    record.dependencies.forEach((dependency) => {
      if (!recordMap.has(dependency.sourceBlockId) || dependency.sourceBlockId === record.blockId) {
        return;
      }

      const neighbours = adjacency.get(dependency.sourceBlockId);

      if (!neighbours || neighbours.has(record.blockId)) {
        return;
      }

      neighbours.add(record.blockId);
      inDegree.set(record.blockId, (inDegree.get(record.blockId) ?? 0) + 1);
    });
  });

  const queue = sorted
    .map((record) => record.blockId)
    .filter((blockId) => (inDegree.get(blockId) ?? 0) === 0)
    .sort((left, right) => (orderMap.get(left) ?? 0) - (orderMap.get(right) ?? 0));

  const ordered: FlowBlock[] = [];

  while (queue.length > 0) {
    const nextBlockId = queue.shift();

    if (!nextBlockId) {
      break;
    }

    const record = recordMap.get(nextBlockId);

    if (!record) {
      continue;
    }

    ordered.push(ensureBlockId(record.config as FlowBlock, record.blockId));

    const neighbours = [...(adjacency.get(nextBlockId) ?? [])].sort(
      (left, right) => (orderMap.get(left) ?? 0) - (orderMap.get(right) ?? 0),
    );

    neighbours.forEach((targetBlockId) => {
      const nextInDegree = (inDegree.get(targetBlockId) ?? 0) - 1;
      inDegree.set(targetBlockId, nextInDegree);

      if (nextInDegree === 0) {
        queue.push(targetBlockId);
        queue.sort((left, right) => (orderMap.get(left) ?? 0) - (orderMap.get(right) ?? 0));
      }
    });
  }

  if (ordered.length !== sorted.length) {
    throw new AppError('Flow has circular links. Remove cycles before compile/publish.', 400, 'FLOW_GRAPH_CYCLE');
  }

  return ordered;
};
