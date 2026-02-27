import { type HydratedDocument, model, Schema, Types } from 'mongoose';
import type { FlowGraph, FlowProposalDefaults } from '@/features/flow/flow.types';

export interface FlowCompilationSnapshot {
  compiledAt: Date;
  riskScore: number;
  riskLevel: 'safe' | 'warning' | 'critical';
  warnings: string[];
  instructionCount: number;
}

export interface Flow {
  daoId: Types.ObjectId;
  name: string;
  slug: string;
  description: string;
  tags: string[];
  status: 'draft' | 'published' | 'archived';
  version: number;
  blocks: unknown[];
  graph: FlowGraph | null;
  proposalDefaults: FlowProposalDefaults;
  latestCompilation: FlowCompilationSnapshot | null;
  lastPublishedProposalId: Types.ObjectId | null;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const flowProposalDefaultsSchema = new Schema<FlowProposalDefaults>(
  {
    titlePrefix: {
      type: String,
      required: true,
      trim: true,
      default: 'Proposal',
    },
    voteScope: {
      type: String,
      enum: ['community', 'council'],
      default: 'community',
    },
    state: {
      type: String,
      enum: ['draft', 'voting'],
      default: 'voting',
    },
    holdUpSeconds: {
      type: Number,
      default: 0,
      min: 0,
    },
    votingDurationHours: {
      type: Number,
      default: 72,
      min: 1,
      max: 720,
    },
    autoExecute: {
      type: Boolean,
      default: true,
    },
    executeAfterHoldUp: {
      type: Boolean,
      default: true,
    },
    maxRiskScore: {
      type: Number,
      default: 70,
      min: 0,
      max: 100,
    },
  },
  {
    _id: false,
  },
);

const flowCompilationSnapshotSchema = new Schema<FlowCompilationSnapshot>(
  {
    compiledAt: {
      type: Date,
      required: true,
    },
    riskScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    riskLevel: {
      type: String,
      enum: ['safe', 'warning', 'critical'],
      required: true,
    },
    warnings: {
      type: [String],
      default: [],
    },
    instructionCount: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    _id: false,
  },
);

const flowGraphNodeSchema = new Schema<FlowGraph['nodes'][number]>(
  {
    id: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    x: {
      type: Number,
      required: true,
      min: 0,
    },
    y: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    _id: false,
  },
);

const flowGraphEdgeSchema = new Schema<FlowGraph['edges'][number]>(
  {
    id: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120,
    },
    source: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    target: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
  },
  {
    _id: false,
  },
);

const flowGraphSchema = new Schema<FlowGraph>(
  {
    nodes: {
      type: [flowGraphNodeSchema],
      default: [],
    },
    edges: {
      type: [flowGraphEdgeSchema],
      default: [],
    },
  },
  {
    _id: false,
  },
);

const flowSchema = new Schema<Flow>(
  {
    daoId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'Dao',
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      minlength: 2,
      maxlength: 120,
    },
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: 2000,
    },
    tags: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'draft',
      index: true,
    },
    version: {
      type: Number,
      default: 1,
      min: 1,
    },
    blocks: {
      type: Schema.Types.Mixed,
      required: true,
      validate: {
        validator: (value: unknown) => Array.isArray(value) && value.length > 0,
        message: 'Flow must have at least one block',
      },
    },
    graph: {
      type: flowGraphSchema,
      default: null,
    },
    proposalDefaults: {
      type: flowProposalDefaultsSchema,
      default: () => ({
        titlePrefix: 'Proposal',
        voteScope: 'community',
        state: 'voting',
        holdUpSeconds: 0,
        votingDurationHours: 72,
        autoExecute: true,
        executeAfterHoldUp: true,
        maxRiskScore: 70,
      }),
    },
    latestCompilation: {
      type: flowCompilationSnapshotSchema,
      default: null,
    },
    lastPublishedProposalId: {
      type: Schema.Types.ObjectId,
      ref: 'Proposal',
      default: null,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform: (_doc, ret: any) => {
        ret.id = ret._id;
        delete ret._id;
        return ret;
      },
    },
  },
);

flowSchema.index({ daoId: 1, slug: 1 }, { unique: true });
flowSchema.index({ daoId: 1, createdAt: -1 });

export type FlowDocument = HydratedDocument<Flow>;

export const FlowModel = model<Flow>('Flow', flowSchema);
