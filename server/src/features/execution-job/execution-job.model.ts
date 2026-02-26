import { type HydratedDocument, model, Schema, Types } from 'mongoose';

export const executionJobStatuses = ['pending', 'running', 'completed', 'failed'] as const;

export type ExecutionJobStatus = (typeof executionJobStatuses)[number];

export interface ExecutionJob {
  daoId: Types.ObjectId;
  proposalId: Types.ObjectId;
  status: ExecutionJobStatus;
  attemptCount: number;
  maxRetries: number;
  nextRunAt: Date;
  lockedBy: string | null;
  lockExpiresAt: Date | null;
  completedAt: Date | null;
  executionReference: string | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const executionJobSchema = new Schema<ExecutionJob>(
  {
    daoId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'Dao',
      index: true,
    },
    proposalId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'Proposal',
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: executionJobStatuses,
      default: 'pending',
      index: true,
    },
    attemptCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxRetries: {
      type: Number,
      default: 5,
      min: 1,
    },
    nextRunAt: {
      type: Date,
      default: () => new Date(),
      index: true,
    },
    lockedBy: {
      type: String,
      default: null,
    },
    lockExpiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    executionReference: {
      type: String,
      default: null,
    },
    lastError: {
      type: String,
      default: null,
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

executionJobSchema.index({ status: 1, nextRunAt: 1 });
executionJobSchema.index({ lockExpiresAt: 1, status: 1 });

export type ExecutionJobDocument = HydratedDocument<ExecutionJob>;

export const ExecutionJobModel = model<ExecutionJob>('ExecutionJob', executionJobSchema);
