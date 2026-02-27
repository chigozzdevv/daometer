import { type HydratedDocument, model, Schema, Types } from 'mongoose';

export interface DaoAutomationConfig {
  autoExecuteEnabled: boolean;
  maxRiskScore: number;
  requireSimulation: boolean;
}

export interface Dao {
  name: string;
  slug: string;
  description: string;
  network: 'mainnet-beta' | 'devnet';
  realmAddress: string;
  governanceProgramId: string;
  defaultGovernanceAddress: string | null;
  authorityWallet: string;
  communityMint: string | null;
  councilMint: string | null;
  createdBy: Types.ObjectId;
  automationConfig: DaoAutomationConfig;
  createdAt: Date;
  updatedAt: Date;
}

const daoAutomationConfigSchema = new Schema<DaoAutomationConfig>(
  {
    autoExecuteEnabled: {
      type: Boolean,
      default: true,
    },
    maxRiskScore: {
      type: Number,
      default: 70,
      min: 0,
      max: 100,
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

const daoSchema = new Schema<Dao>(
  {
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
      unique: true,
      lowercase: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    network: {
      type: String,
      enum: ['mainnet-beta', 'devnet'],
      default: 'mainnet-beta',
    },
    realmAddress: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    governanceProgramId: {
      type: String,
      required: true,
      trim: true,
    },
    defaultGovernanceAddress: {
      type: String,
      trim: true,
      default: null,
    },
    authorityWallet: {
      type: String,
      required: true,
      trim: true,
    },
    communityMint: {
      type: String,
      trim: true,
      default: null,
    },
    councilMint: {
      type: String,
      trim: true,
      default: null,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true,
    },
    automationConfig: {
      type: daoAutomationConfigSchema,
      default: () => ({
        autoExecuteEnabled: true,
        maxRiskScore: 70,
        requireSimulation: true,
      }),
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

export type DaoDocument = HydratedDocument<Dao>;

export const DaoModel = model<Dao>('Dao', daoSchema);
