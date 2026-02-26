import { type HydratedDocument, model, Schema, Types } from 'mongoose';

export const proposalStates = [
  'draft',
  'voting',
  'succeeded',
  'defeated',
  'cancelled',
  'executed',
  'execution-error',
] as const;

export type ProposalState = (typeof proposalStates)[number];

export interface ProposalInstruction {
  index: number;
  kind: 'transfer' | 'config' | 'program-upgrade' | 'stream' | 'custom';
  label: string;
  programId: string;
  accounts: string[];
  accountMetas?: Array<{
    pubkey: string;
    isSigner: boolean;
    isWritable: boolean;
  }>;
  dataBase64: string | null;
  riskScore: number;
  riskLevel: 'safe' | 'warning' | 'critical';
}

export interface ProposalAutomation {
  autoExecute: boolean;
  executeAfterHoldUp: boolean;
  maxRiskScore: number;
}

export interface ProposalOnchainExecution {
  enabled: boolean;
  governanceProgramId: string | null;
  programVersion: number;
  governanceAddress: string | null;
  proposalAddress: string | null;
  transactionAddresses: string[];
  rpcUrl: string | null;
  requireSimulation: boolean;
}

export interface ProposalManualApproval {
  required: boolean;
  approved: boolean | null;
  approvedBy: Types.ObjectId | null;
  approvedAt: Date | null;
  note: string | null;
}

export interface Proposal {
  daoId: Types.ObjectId;
  proposalAddress: string;
  title: string;
  description: string;
  voteScope: 'community' | 'council';
  state: ProposalState;
  holdUpSeconds: number;
  votingEndsAt: Date;
  succeededAt: Date | null;
  executedAt: Date | null;
  executionReference: string | null;
  executionError: string | null;
  riskScore: number;
  riskLevel: 'safe' | 'warning' | 'critical';
  instructions: ProposalInstruction[];
  automation: ProposalAutomation;
  onchainExecution: ProposalOnchainExecution;
  manualApproval: ProposalManualApproval;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const proposalInstructionSchema = new Schema<ProposalInstruction>(
  {
    index: {
      type: Number,
      required: true,
      min: 0,
    },
    kind: {
      type: String,
      enum: ['transfer', 'config', 'program-upgrade', 'stream', 'custom'],
      required: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    programId: {
      type: String,
      required: true,
      trim: true,
    },
    accounts: {
      type: [String],
      default: [],
    },
    accountMetas: {
      type: [
        new Schema(
          {
            pubkey: { type: String, required: true, trim: true },
            isSigner: { type: Boolean, required: true, default: false },
            isWritable: { type: Boolean, required: true, default: false },
          },
          { _id: false },
        ),
      ],
      default: undefined,
    },
    dataBase64: {
      type: String,
      default: null,
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
  },
  {
    _id: false,
  },
);

const proposalAutomationSchema = new Schema<ProposalAutomation>(
  {
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
      min: 0,
      max: 100,
      default: 70,
    },
  },
  {
    _id: false,
  },
);

const proposalOnchainExecutionSchema = new Schema<ProposalOnchainExecution>(
  {
    enabled: {
      type: Boolean,
      default: false,
    },
    governanceProgramId: {
      type: String,
      default: null,
      trim: true,
    },
    programVersion: {
      type: Number,
      default: 3,
      min: 1,
      max: 10,
    },
    governanceAddress: {
      type: String,
      default: null,
      trim: true,
    },
    proposalAddress: {
      type: String,
      default: null,
      trim: true,
    },
    transactionAddresses: {
      type: [String],
      default: [],
    },
    rpcUrl: {
      type: String,
      default: null,
      trim: true,
    },
    requireSimulation: {
      type: Boolean,
      default: true,
    },
  },
  {
    _id: false,
  },
);

const proposalManualApprovalSchema = new Schema<ProposalManualApproval>(
  {
    required: {
      type: Boolean,
      default: false,
    },
    approved: {
      type: Boolean,
      default: null,
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    note: {
      type: String,
      default: null,
      trim: true,
      maxlength: 1000,
    },
  },
  { _id: false },
);

const proposalSchema = new Schema<Proposal>(
  {
    daoId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'Dao',
      index: true,
    },
    proposalAddress: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: 5000,
    },
    voteScope: {
      type: String,
      enum: ['community', 'council'],
      default: 'community',
    },
    state: {
      type: String,
      enum: proposalStates,
      default: 'draft',
      index: true,
    },
    holdUpSeconds: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    votingEndsAt: {
      type: Date,
      required: true,
      index: true,
    },
    succeededAt: {
      type: Date,
      default: null,
      index: true,
    },
    executedAt: {
      type: Date,
      default: null,
      index: true,
    },
    executionReference: {
      type: String,
      default: null,
    },
    executionError: {
      type: String,
      default: null,
    },
    riskScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      default: 0,
      index: true,
    },
    riskLevel: {
      type: String,
      enum: ['safe', 'warning', 'critical'],
      default: 'safe',
    },
    instructions: {
      type: [proposalInstructionSchema],
      required: true,
      validate: {
        validator: (value: ProposalInstruction[]) => value.length > 0,
        message: 'Proposal must include at least one instruction',
      },
    },
    automation: {
      type: proposalAutomationSchema,
      default: () => ({
        autoExecute: true,
        executeAfterHoldUp: true,
        maxRiskScore: 70,
      }),
    },
    onchainExecution: {
      type: proposalOnchainExecutionSchema,
      default: () => ({
        enabled: false,
        governanceProgramId: null,
        programVersion: 3,
        governanceAddress: null,
        proposalAddress: null,
        transactionAddresses: [],
        rpcUrl: null,
        requireSimulation: true,
      }),
    },
    manualApproval: {
      type: proposalManualApprovalSchema,
      default: () => ({
        required: false,
        approved: null,
        approvedBy: null,
        approvedAt: null,
        note: null,
      }),
    },
    createdBy: {
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

proposalSchema.index({ daoId: 1, createdAt: -1 });
proposalSchema.index({ daoId: 1, state: 1, votingEndsAt: 1 });

export type ProposalDocument = HydratedDocument<Proposal>;

export const ProposalModel = model<Proposal>('Proposal', proposalSchema);
