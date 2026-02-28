import { type HydratedDocument, model, Schema, Types } from 'mongoose';
import type { FlowBlock, FlowBlockDependency } from '@/features/flow/flow.types';

export interface FlowBlockPosition {
  x: number;
  y: number;
}

export interface FlowBlockRecord {
  flowId: Types.ObjectId;
  daoId: Types.ObjectId;
  blockId: string;
  type: FlowBlock['type'];
  config: FlowBlock;
  position: FlowBlockPosition;
  uiWidth: number;
  dependencies: FlowBlockDependency[];
  orderIndex: number;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const flowBlockDependencySchema = new Schema<FlowBlockDependency>(
  {
    sourceBlockId: {
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

const flowBlockPositionSchema = new Schema<FlowBlockPosition>(
  {
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

const flowBlockSchema = new Schema<FlowBlockRecord>(
  {
    flowId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'Flow',
      index: true,
    },
    daoId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'Dao',
      index: true,
    },
    blockId: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    type: {
      type: String,
      required: true,
      enum: [
        'transfer-sol',
        'transfer-spl',
        'set-governance-config',
        'program-upgrade',
        'create-token-account',
        'create-stream',
        'custom-instruction',
      ],
    },
    config: {
      type: Schema.Types.Mixed,
      required: true,
    },
    position: {
      type: flowBlockPositionSchema,
      required: true,
    },
    uiWidth: {
      type: Number,
      required: true,
      min: 240,
      max: 720,
      default: 360,
    },
    dependencies: {
      type: [flowBlockDependencySchema],
      default: [],
    },
    orderIndex: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  },
);

flowBlockSchema.index({ flowId: 1, blockId: 1 }, { unique: true });
flowBlockSchema.index({ flowId: 1, orderIndex: 1 });

export type FlowBlockDocument = HydratedDocument<FlowBlockRecord>;

export const FlowBlockModel = model<FlowBlockRecord>('FlowBlock', flowBlockSchema);
