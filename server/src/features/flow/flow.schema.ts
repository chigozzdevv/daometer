import { z } from 'zod';

const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const objectIdSchema = z.string().trim().length(24);
const emptyObject = z.object({}).strip();

const blockBaseSchema = z.object({
  id: z.string().trim().min(2).max(80),
  label: z.string().trim().min(2).max(120),
  note: z.string().trim().max(500).optional(),
});

const transferSolBlockSchema = blockBaseSchema.extend({
  type: z.literal('transfer-sol'),
  fromGovernance: z.string().trim().regex(base58Regex),
  toWallet: z.string().trim().regex(base58Regex),
  lamports: z.number().int().positive(),
});

const transferSplBlockSchema = blockBaseSchema.extend({
  type: z.literal('transfer-spl'),
  tokenMint: z.string().trim().regex(base58Regex),
  fromTokenAccount: z.string().trim().regex(base58Regex),
  toTokenAccount: z.string().trim().regex(base58Regex),
  amount: z.string().trim().regex(/^\d+(\.\d+)?$/),
  decimals: z.number().int().min(0).max(12),
});

const setGovernanceConfigBlockSchema = blockBaseSchema.extend({
  type: z.literal('set-governance-config'),
  governanceAddress: z.string().trim().regex(base58Regex),
  yesVoteThresholdPercent: z.number().int().min(1).max(100),
  baseVotingTimeSeconds: z.number().int().min(3600),
  minInstructionHoldUpTimeSeconds: z.number().int().min(0),
  communityVetoThresholdPercent: z.number().int().min(0).max(100).optional(),
});

const programUpgradeBlockSchema = blockBaseSchema.extend({
  type: z.literal('program-upgrade'),
  programId: z.string().trim().regex(base58Regex),
  bufferAddress: z.string().trim().regex(base58Regex),
  spillAddress: z.string().trim().regex(base58Regex),
});

const createStreamBlockSchema = blockBaseSchema.extend({
  type: z.literal('create-stream'),
  streamProgramId: z.string().trim().regex(base58Regex),
  treasuryTokenAccount: z.string().trim().regex(base58Regex),
  recipientWallet: z.string().trim().regex(base58Regex),
  tokenMint: z.string().trim().regex(base58Regex),
  totalAmount: z.string().trim().regex(/^\d+(\.\d+)?$/),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  canCancel: z.boolean(),
  instructionDataBase64: z.string().trim().min(4).optional(),
  accountMetas: z
    .array(
      z.object({
        pubkey: z.string().trim().regex(base58Regex),
        isSigner: z.boolean().default(false),
        isWritable: z.boolean().default(false),
      }),
    )
    .max(32)
    .optional(),
});

const customInstructionBlockSchema = blockBaseSchema.extend({
  type: z.literal('custom-instruction'),
  programId: z.string().trim().regex(base58Regex),
  accounts: z
    .array(
      z.object({
        pubkey: z.string().trim().regex(base58Regex),
        isSigner: z.boolean().default(false),
        isWritable: z.boolean().default(false),
      }),
    )
    .max(32),
  dataBase64: z.string().trim().min(4),
  kind: z.enum(['custom', 'defi', 'governance']).default('custom'),
});

const flowBlockSchema = z.discriminatedUnion('type', [
  transferSolBlockSchema,
  transferSplBlockSchema,
  setGovernanceConfigBlockSchema,
  programUpgradeBlockSchema,
  createStreamBlockSchema,
  customInstructionBlockSchema,
]);

const proposalDefaultsSchema = z.object({
  titlePrefix: z.string().trim().min(2).max(80),
  voteScope: z.enum(['community', 'council']).default('community'),
  state: z.enum(['draft', 'voting']).default('voting'),
  holdUpSeconds: z.number().int().min(0).default(0),
  votingDurationHours: z.number().int().min(1).max(720).default(72),
  autoExecute: z.boolean().default(true),
  executeAfterHoldUp: z.boolean().default(true),
  maxRiskScore: z.number().int().min(0).max(100).default(70),
});

const flowGraphNodeSchema = z.object({
  id: z.string().trim().min(2).max(80),
  x: z.number().min(0),
  y: z.number().min(0),
});

const flowGraphEdgeSchema = z.object({
  id: z.string().trim().min(2).max(120),
  source: z.string().trim().min(2).max(80),
  target: z.string().trim().min(2).max(80),
});

const flowGraphSchema = z.object({
  nodes: z.array(flowGraphNodeSchema).max(60),
  edges: z.array(flowGraphEdgeSchema).max(120),
});

const compileContextSchema = z.object({
  nativeTreasuryLamports: z.number().int().nonnegative().optional(),
  tokenTreasuryBalances: z
    .array(
      z.object({
        mint: z.string().trim().regex(base58Regex),
        amount: z.string().trim().regex(/^\d+(\.\d+)?$/),
        decimals: z.number().int().min(0).max(12),
      }),
    )
    .optional(),
  governanceProgramId: z.string().trim().regex(base58Regex).optional(),
});

const onchainExecutionConfigSchema = z.object({
  enabled: z.boolean().default(false),
  governanceProgramId: z.string().trim().regex(base58Regex).optional(),
  programVersion: z.number().int().min(1).max(10).default(3),
  governanceAddress: z.string().trim().regex(base58Regex),
  proposalAddress: z.string().trim().regex(base58Regex).optional(),
  transactionAddresses: z.array(z.string().trim().regex(base58Regex)).min(1).max(50),
  rpcUrl: z.string().trim().url().optional(),
  requireSimulation: z.boolean().default(true),
});

const onchainCreateConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    governanceProgramId: z.string().trim().regex(base58Regex).optional(),
    programVersion: z.number().int().min(1).max(10).default(3),
    realmAddress: z.string().trim().regex(base58Regex).optional(),
    governanceAddress: z.string().trim().regex(base58Regex).optional(),
    governingTokenMint: z.string().trim().regex(base58Regex).optional(),
    descriptionLink: z.string().trim().url().optional(),
    optionIndex: z.number().int().min(0).max(20).default(0),
    useDenyOption: z.boolean().default(true),
    rpcUrl: z.string().trim().url().optional(),
    signOff: z.boolean().default(true),
    requireSimulation: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if (!value.enabled) {
      return;
    }

    if (!value.realmAddress) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['realmAddress'],
        message: 'realmAddress is required when onchainCreate is enabled',
      });
    }

    if (!value.governanceAddress) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['governanceAddress'],
        message: 'governanceAddress is required when onchainCreate is enabled',
      });
    }

    if (!value.governingTokenMint) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['governingTokenMint'],
        message: 'governingTokenMint is required when onchainCreate is enabled',
      });
    }
  })
  .optional();

export const createFlowSchema = z.object({
  body: z.object({
    daoId: objectIdSchema,
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(2000).optional(),
    tags: z.array(z.string().trim().min(2).max(40)).max(10).optional(),
    blocks: z.array(flowBlockSchema).min(1).max(30),
    graph: flowGraphSchema.optional(),
    proposalDefaults: proposalDefaultsSchema.optional(),
  }),
  params: emptyObject,
  query: emptyObject,
});

export const updateFlowSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(2).max(120).optional(),
      description: z.string().trim().max(2000).optional(),
      tags: z.array(z.string().trim().min(2).max(40)).max(10).optional(),
      blocks: z.array(flowBlockSchema).min(1).max(30).optional(),
      graph: flowGraphSchema.optional(),
      proposalDefaults: proposalDefaultsSchema.partial().optional(),
      status: z.enum(['draft', 'published', 'archived']).optional(),
    })
    .refine((value) => Object.keys(value).length > 0, 'At least one field is required'),
  params: z.object({
    flowId: objectIdSchema,
  }),
  query: emptyObject,
});

export const getFlowSchema = z.object({
  body: emptyObject,
  params: z.object({
    flowId: objectIdSchema,
  }),
  query: emptyObject,
});

export const listFlowSchema = z.object({
  body: emptyObject,
  params: emptyObject,
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    daoId: objectIdSchema.optional(),
    status: z.enum(['draft', 'published', 'archived']).optional(),
    search: z.string().trim().max(120).optional(),
  }),
});

export const compileFlowSchema = z.object({
  body: z.object({
    context: compileContextSchema.optional(),
  }),
  params: z.object({
    flowId: objectIdSchema,
  }),
  query: emptyObject,
});

export const compileInlineFlowSchema = z.object({
  body: z.object({
    blocks: z.array(flowBlockSchema).min(1).max(30),
    context: compileContextSchema.optional(),
  }),
  params: emptyObject,
  query: emptyObject,
});

export const publishFlowSchema = z.object({
  body: z.object({
    proposalAddress: z.string().trim().regex(base58Regex).optional(),
    title: z.string().trim().min(3).max(200).optional(),
    description: z.string().trim().max(5000).optional(),
    voteScope: z.enum(['community', 'council']).optional(),
    state: z.enum(['draft', 'voting']).optional(),
    holdUpSeconds: z.number().int().min(0).optional(),
    votingDurationHours: z.number().int().min(1).max(720).optional(),
    automation: z
      .object({
        autoExecute: z.boolean().optional(),
        executeAfterHoldUp: z.boolean().optional(),
        maxRiskScore: z.number().int().min(0).max(100).optional(),
      })
      .optional(),
    context: compileContextSchema.optional(),
    onchainExecution: onchainExecutionConfigSchema.optional(),
    onchainCreate: onchainCreateConfigSchema,
  }),
  params: z.object({
    flowId: objectIdSchema,
  }),
  query: emptyObject,
});
