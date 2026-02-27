import { z } from 'zod';

const emptyObject = z.object({}).strip();
const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const onchainExecutionSchema = z
  .object({
    enabled: z.boolean().default(false),
    governanceProgramId: z.string().trim().regex(base58Regex).optional(),
    programVersion: z.number().int().min(1).max(10).default(3),
    governanceAddress: z.string().trim().regex(base58Regex).optional(),
    proposalAddress: z.string().trim().regex(base58Regex).optional(),
    transactionAddresses: z.array(z.string().trim().regex(base58Regex)).max(50).default([]),
    rpcUrl: z.string().trim().url().optional(),
    requireSimulation: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if (!value.enabled) {
      return;
    }

    if (!value.governanceProgramId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['governanceProgramId'],
        message: 'governanceProgramId is required when onchain execution is enabled',
      });
    }

    if (!value.governanceAddress) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['governanceAddress'],
        message: 'governanceAddress is required when onchain execution is enabled',
      });
    }

    if (value.transactionAddresses.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['transactionAddresses'],
        message: 'At least one transaction address is required when onchain execution is enabled',
      });
    }
  });

const instructionSchema = z.object({
  index: z.number().int().min(0),
  kind: z.enum(['transfer', 'config', 'program-upgrade', 'stream', 'custom']),
  label: z.string().trim().min(2).max(120),
  programId: z.string().trim().regex(base58Regex, 'Invalid program id'),
  accounts: z.array(z.string().trim().regex(base58Regex, 'Invalid account address')).default([]),
  accountMetas: z
    .array(
      z.object({
        pubkey: z.string().trim().regex(base58Regex, 'Invalid account address'),
        isSigner: z.boolean(),
        isWritable: z.boolean(),
      }),
    )
    .max(64)
    .optional(),
  dataBase64: z.string().trim().min(2).optional(),
  riskScore: z.number().int().min(0).max(100),
});

export const createProposalSchema = z.object({
  body: z.object({
    daoId: z.string().trim().length(24),
    sourceFlowId: z.string().trim().length(24).optional(),
    proposalAddress: z.string().trim().regex(base58Regex, 'Invalid proposal address').optional(),
    title: z.string().trim().min(3).max(200),
    description: z.string().trim().max(5000).optional(),
    voteScope: z.enum(['community', 'council']).default('community'),
    state: z.enum(['draft', 'voting']).default('draft'),
    holdUpSeconds: z.number().int().min(0).default(0),
    votingEndsAt: z.coerce.date(),
    instructions: z.array(instructionSchema).min(1).max(20),
    automation: z
      .object({
        autoExecute: z.boolean().default(true),
        executeAfterHoldUp: z.boolean().default(true),
        maxRiskScore: z.number().int().min(0).max(100).optional(),
      })
      .optional(),
    onchainExecution: onchainExecutionSchema.optional(),
  }),
  params: emptyObject,
  query: emptyObject,
});

export const getProposalSchema = z.object({
  body: emptyObject,
  params: z.object({
    proposalId: z.string().trim().length(24),
  }),
  query: emptyObject,
});

export const listProposalSchema = z.object({
  body: emptyObject,
  params: z.object({
    daoId: z.string().trim().length(24),
  }),
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    state: z
      .enum(['draft', 'voting', 'succeeded', 'defeated', 'cancelled', 'executed', 'execution-error'])
      .optional(),
  }),
});

export const transitionProposalStateSchema = z.object({
  body: z.object({
    state: z.enum(['draft', 'voting', 'succeeded', 'defeated', 'cancelled', 'executed', 'execution-error']),
    executionError: z.string().trim().max(1000).optional(),
  }),
  params: z.object({
    proposalId: z.string().trim().length(24),
  }),
  query: emptyObject,
});

export const updateProposalOnchainExecutionSchema = z.object({
  body: onchainExecutionSchema,
  params: z.object({
    proposalId: z.string().trim().length(24),
  }),
  query: emptyObject,
});

export const syncProposalOnchainExecutionSchema = z.object({
  body: z.object({
    governanceProgramId: z.string().trim().regex(base58Regex).optional(),
    programVersion: z.number().int().min(1).max(10).default(3),
    governanceAddress: z.string().trim().regex(base58Regex).optional(),
    proposalAddress: z.string().trim().regex(base58Regex).optional(),
    optionIndexes: z.array(z.number().int().min(0).max(20)).max(20).optional(),
    rpcUrl: z.string().trim().url().optional(),
    requireSimulation: z.boolean().default(true),
  }),
  params: z.object({
    proposalId: z.string().trim().length(24),
  }),
  query: emptyObject,
});

export const createProposalOnchainSchema = z.object({
  body: z.object({
    governanceProgramId: z.string().trim().regex(base58Regex).optional(),
    programVersion: z.number().int().min(1).max(10).default(3),
    realmAddress: z.string().trim().regex(base58Regex),
    governanceAddress: z.string().trim().regex(base58Regex),
    governingTokenMint: z.string().trim().regex(base58Regex),
    descriptionLink: z.string().trim().url().optional(),
    optionIndex: z.number().int().min(0).max(20).default(0),
    useDenyOption: z.boolean().default(true),
    rpcUrl: z.string().trim().url().optional(),
    signOff: z.boolean().default(true),
    requireSimulation: z.boolean().default(true),
  }),
  params: z.object({
    proposalId: z.string().trim().length(24),
  }),
  query: emptyObject,
});

export const prepareProposalOnchainCreateSchema = z.object({
  body: z.object({
    governanceProgramId: z.string().trim().regex(base58Regex).optional(),
    programVersion: z.number().int().min(1).max(10).default(3),
    realmAddress: z.string().trim().regex(base58Regex),
    governanceAddress: z.string().trim().regex(base58Regex),
    governingTokenMint: z.string().trim().regex(base58Regex),
    descriptionLink: z.string().trim().url().optional(),
    optionIndex: z.number().int().min(0).max(20).default(0),
    useDenyOption: z.boolean().default(true),
    rpcUrl: z.string().trim().url().optional(),
    signOff: z.boolean().default(true),
  }),
  params: z.object({
    proposalId: z.string().trim().length(24),
  }),
  query: emptyObject,
});

export const prepareProposalOnchainExecutionSchema = z.object({
  body: z.object({
    rpcUrl: z.string().trim().url().optional(),
  }),
  params: z.object({
    proposalId: z.string().trim().length(24),
  }),
  query: emptyObject,
});

export const decideProposalManualApprovalSchema = z.object({
  body: z.object({
    approved: z.boolean(),
    note: z.string().trim().max(1000).optional(),
  }),
  params: z.object({
    proposalId: z.string().trim().length(24),
  }),
  query: emptyObject,
});
