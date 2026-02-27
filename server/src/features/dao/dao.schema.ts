import { z } from 'zod';

const emptyObject = z.object({}).strip();

const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export const createDaoSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(2000).optional(),
    network: z.enum(['mainnet-beta', 'devnet']).default('mainnet-beta'),
    realmAddress: z.string().trim().regex(base58Regex, 'Invalid realm address'),
    governanceProgramId: z.string().trim().regex(base58Regex, 'Invalid governance program id'),
    defaultGovernanceAddress: z.string().trim().regex(base58Regex, 'Invalid default governance address').optional(),
    authorityWallet: z.string().trim().regex(base58Regex, 'Invalid authority wallet'),
    communityMint: z.string().trim().regex(base58Regex, 'Invalid community mint').optional(),
    councilMint: z.string().trim().regex(base58Regex, 'Invalid council mint').optional(),
    slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/).optional(),
    automationConfig: z
      .object({
        autoExecuteEnabled: z.boolean().optional(),
        maxRiskScore: z.number().int().min(0).max(100).optional(),
        requireSimulation: z.boolean().optional(),
      })
      .optional(),
  }),
  params: emptyObject,
  query: emptyObject,
});

export const createDaoOnchainSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(120),
    network: z.enum(['mainnet-beta', 'devnet']).default('devnet'),
    communityMint: z.string().trim().regex(base58Regex, 'Invalid community mint'),
    councilMint: z.string().trim().regex(base58Regex, 'Invalid council mint').optional(),
    governanceProgramId: z.string().trim().regex(base58Regex, 'Invalid governance program id').optional(),
    authorityWallet: z.string().trim().regex(base58Regex, 'Invalid authority wallet').optional(),
    rpcUrl: z.string().trim().url().optional(),
    programVersion: z.number().int().min(1).max(10).default(3),
  }),
  params: emptyObject,
  query: emptyObject,
});

export const prepareCommunityMintSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(120),
    network: z.enum(['mainnet-beta', 'devnet']).default('devnet'),
    authorityWallet: z.string().trim().regex(base58Regex, 'Invalid authority wallet').optional(),
    decimals: z.number().int().min(0).max(9).default(6),
    rpcUrl: z.string().trim().url().optional(),
  }),
  params: emptyObject,
  query: emptyObject,
});

export const updateDaoSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(2).max(120).optional(),
      description: z.string().trim().max(2000).optional(),
      defaultGovernanceAddress: z
        .union([z.string().trim().regex(base58Regex, 'Invalid default governance address'), z.null()])
        .optional(),
      automationConfig: z
        .object({
          autoExecuteEnabled: z.boolean().optional(),
          maxRiskScore: z.number().int().min(0).max(100).optional(),
          requireSimulation: z.boolean().optional(),
        })
        .optional(),
    })
    .refine((value) => Object.keys(value).length > 0, 'At least one field is required'),
  params: z.object({
    daoId: z.string().trim().length(24),
  }),
  query: emptyObject,
});

export const getDaoSchema = z.object({
  body: emptyObject,
  params: z.object({
    daoId: z.string().trim().length(24),
  }),
  query: emptyObject,
});

export const listDaoGovernancesSchema = z.object({
  body: emptyObject,
  params: z.object({
    daoId: z.string().trim().length(24),
  }),
  query: z.object({
    rpcUrl: z.string().trim().url().optional(),
  }),
});

export const listDaoSchema = z.object({
  body: emptyObject,
  params: emptyObject,
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(120).optional(),
  }),
});
