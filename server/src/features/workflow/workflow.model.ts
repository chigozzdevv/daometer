import { type HydratedDocument, model, Schema, Types } from 'mongoose';
import { proposalStates, type ProposalState } from '@/features/proposal/proposal.model';

export const workflowTriggerTypes = ['proposal-state-changed', 'voting-ends-in', 'hold-up-expires-in'] as const;
export type WorkflowTriggerType = (typeof workflowTriggerTypes)[number];

export const workflowConditionModes = ['all', 'any'] as const;
export type WorkflowConditionMode = (typeof workflowConditionModes)[number];

export const workflowConditionFields = [
  'state',
  'voteScope',
  'riskScore',
  'holdUpSeconds',
  'onchainEnabled',
  'autoExecute',
  'hasExecutionError',
  'manualApprovalRequired',
  'manualApprovalApproved',
  'hoursToVotingEnd',
  'hoursToHoldUpExpiry',
  'daoId',
  'sourceFlowId',
] as const;
export type WorkflowConditionField = (typeof workflowConditionFields)[number];

export const workflowConditionOperators = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'not-in', 'contains'] as const;
export type WorkflowConditionOperator = (typeof workflowConditionOperators)[number];

export const workflowActionTypes = ['send-email', 'enqueue-execution', 'set-manual-approval', 'execute-now'] as const;
export type WorkflowActionType = (typeof workflowActionTypes)[number];

export interface WorkflowTrigger {
  type: WorkflowTriggerType;
  states: ProposalState[];
  offsetMinutes: number;
}

export interface WorkflowFilter {
  voteScope: 'community' | 'council' | null;
  minRiskScore: number | null;
  maxRiskScore: number | null;
  onchainExecutionEnabled: boolean | null;
  proposalId: string | null;
}

export interface WorkflowConditionRule {
  field: WorkflowConditionField;
  operator: WorkflowConditionOperator;
  value: unknown;
}

export interface WorkflowConditionGroup {
  mode: WorkflowConditionMode;
  rules: WorkflowConditionRule[];
}

export interface WorkflowAction {
  type: WorkflowActionType;
  enabled: boolean;
  config: Record<string, unknown>;
}

export interface WorkflowRule {
  daoId: Types.ObjectId;
  flowId: Types.ObjectId;
  name: string;
  description: string;
  enabled: boolean;
  trigger: WorkflowTrigger;
  filters: WorkflowFilter;
  conditions: WorkflowConditionGroup;
  actions: {
    onTrue: WorkflowAction[];
    onFalse: WorkflowAction[];
  };
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowActionResult {
  type: WorkflowActionType;
  status: 'success' | 'failed' | 'skipped';
  message: string;
  details?: Record<string, unknown>;
}

export interface WorkflowEvent {
  workflowRuleId: Types.ObjectId;
  daoId: Types.ObjectId;
  proposalId: Types.ObjectId;
  triggerType: WorkflowTriggerType;
  triggerKey: string;
  matched: boolean;
  actionResults: WorkflowActionResult[];
  context: Record<string, unknown>;
  error: string | null;
  firedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const workflowTriggerSchema = new Schema<WorkflowTrigger>(
  {
    type: {
      type: String,
      enum: workflowTriggerTypes,
      required: true,
    },
    states: {
      type: [String],
      enum: proposalStates,
      default: [],
    },
    offsetMinutes: {
      type: Number,
      default: 0,
      min: 0,
      max: 30 * 24 * 60,
    },
  },
  { _id: false },
);

const workflowFilterSchema = new Schema<WorkflowFilter>(
  {
    voteScope: {
      type: String,
      enum: ['community', 'council'],
      default: null,
    },
    minRiskScore: {
      type: Number,
      default: null,
      min: 0,
      max: 100,
    },
    maxRiskScore: {
      type: Number,
      default: null,
      min: 0,
      max: 100,
    },
    onchainExecutionEnabled: {
      type: Boolean,
      default: null,
    },
    proposalId: {
      type: String,
      default: null,
      trim: true,
    },
  },
  { _id: false },
);

const workflowConditionRuleSchema = new Schema<WorkflowConditionRule>(
  {
    field: {
      type: String,
      enum: workflowConditionFields,
      required: true,
    },
    operator: {
      type: String,
      enum: workflowConditionOperators,
      required: true,
    },
    value: {
      type: Schema.Types.Mixed,
      required: true,
    },
  },
  { _id: false },
);

const workflowConditionGroupSchema = new Schema<WorkflowConditionGroup>(
  {
    mode: {
      type: String,
      enum: workflowConditionModes,
      default: 'all',
    },
    rules: {
      type: [workflowConditionRuleSchema],
      default: [],
    },
  },
  { _id: false },
);

const workflowActionSchema = new Schema<WorkflowAction>(
  {
    type: {
      type: String,
      enum: workflowActionTypes,
      required: true,
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    config: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { _id: false },
);

const workflowRuleSchema = new Schema<WorkflowRule>(
  {
    daoId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'Dao',
      index: true,
    },
    flowId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'Flow',
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120,
    },
    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: 2000,
    },
    enabled: {
      type: Boolean,
      default: true,
      index: true,
    },
    trigger: {
      type: workflowTriggerSchema,
      required: true,
    },
    filters: {
      type: workflowFilterSchema,
      default: () => ({
        voteScope: null,
        minRiskScore: null,
        maxRiskScore: null,
        onchainExecutionEnabled: null,
        proposalId: null,
      }),
    },
    conditions: {
      type: workflowConditionGroupSchema,
      default: () => ({ mode: 'all', rules: [] }),
    },
    actions: {
      type: new Schema(
        {
          onTrue: {
            type: [workflowActionSchema],
            default: [],
          },
          onFalse: {
            type: [workflowActionSchema],
            default: [],
          },
        },
        { _id: false },
      ),
      required: true,
      default: () => ({ onTrue: [], onFalse: [] }),
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

workflowRuleSchema.index({ flowId: 1, name: 1 }, { unique: true });
workflowRuleSchema.index({ daoId: 1, enabled: 1 });
workflowRuleSchema.index({ flowId: 1, enabled: 1 });

const workflowActionResultSchema = new Schema<WorkflowActionResult>(
  {
    type: {
      type: String,
      enum: workflowActionTypes,
      required: true,
    },
    status: {
      type: String,
      enum: ['success', 'failed', 'skipped'],
      required: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    details: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
  },
  { _id: false },
);

const workflowEventSchema = new Schema<WorkflowEvent>(
  {
    workflowRuleId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'WorkflowRule',
      index: true,
    },
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
      index: true,
    },
    triggerType: {
      type: String,
      enum: workflowTriggerTypes,
      required: true,
    },
    triggerKey: {
      type: String,
      required: true,
      trim: true,
    },
    matched: {
      type: Boolean,
      required: true,
    },
    actionResults: {
      type: [workflowActionResultSchema],
      default: [],
    },
    context: {
      type: Schema.Types.Mixed,
      default: {},
    },
    error: {
      type: String,
      default: null,
    },
    firedAt: {
      type: Date,
      required: true,
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

workflowEventSchema.index({ workflowRuleId: 1, proposalId: 1, triggerKey: 1 }, { unique: true });
workflowEventSchema.index({ workflowRuleId: 1, firedAt: -1 });

export type WorkflowRuleDocument = HydratedDocument<WorkflowRule>;
export type WorkflowEventDocument = HydratedDocument<WorkflowEvent>;

export const WorkflowRuleModel = model<WorkflowRule>('WorkflowRule', workflowRuleSchema);
export const WorkflowEventModel = model<WorkflowEvent>('WorkflowEvent', workflowEventSchema);
