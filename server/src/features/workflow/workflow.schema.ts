import { z } from 'zod';
import {
  proposalStates,
} from '@/features/proposal/proposal.model';
import {
  workflowActionTypes,
  workflowConditionFields,
  workflowConditionModes,
  workflowConditionOperators,
  workflowTriggerTypes,
} from '@/features/workflow/workflow.model';

const emptyObject = z.object({}).strip();
const objectIdSchema = z.string().trim().length(24);

const triggerSchema = z
  .object({
    type: z.enum(workflowTriggerTypes),
    states: z.array(z.enum(proposalStates)).default([]),
    offsetMinutes: z.number().int().min(0).max(30 * 24 * 60).default(0),
  })
  .superRefine((value, ctx) => {
    if (value.type === 'proposal-state-changed' && value.states.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['states'],
        message: 'states is required for proposal-state-changed trigger',
      });
    }

    if (value.type !== 'proposal-state-changed' && value.offsetMinutes <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['offsetMinutes'],
        message: 'offsetMinutes must be greater than 0 for time-based triggers',
      });
    }
  });

const filterSchema = z.object({
  voteScope: z.enum(['community', 'council']).nullable().optional(),
  minRiskScore: z.number().int().min(0).max(100).nullable().optional(),
  maxRiskScore: z.number().int().min(0).max(100).nullable().optional(),
  onchainExecutionEnabled: z.boolean().nullable().optional(),
  proposalId: objectIdSchema.nullable().optional(),
});

const conditionRuleSchema = z.object({
  field: z.enum(workflowConditionFields),
  operator: z.enum(workflowConditionOperators),
  value: z.unknown(),
});

const conditionGroupSchema = z.object({
  mode: z.enum(workflowConditionModes).default('all'),
  rules: z.array(conditionRuleSchema).default([]),
});

const workflowActionSchema = z.object({
  type: z.enum(workflowActionTypes),
  enabled: z.boolean().default(true),
  config: z.record(z.unknown()).default({}),
});

const workflowActionsSchema = z.object({
  onTrue: z.array(workflowActionSchema).default([]),
  onFalse: z.array(workflowActionSchema).default([]),
});

export const createWorkflowRuleSchema = z.object({
  body: z.object({
    flowId: objectIdSchema,
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(2000).optional(),
    enabled: z.boolean().default(true),
    trigger: triggerSchema,
    filters: filterSchema.optional(),
    conditions: conditionGroupSchema.optional(),
    actions: workflowActionsSchema,
  }),
  params: emptyObject,
  query: emptyObject,
});

export const updateWorkflowRuleSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(2).max(120).optional(),
      description: z.string().trim().max(2000).optional(),
      enabled: z.boolean().optional(),
      trigger: triggerSchema.optional(),
      filters: filterSchema.optional(),
      conditions: conditionGroupSchema.optional(),
      actions: workflowActionsSchema.optional(),
    })
    .refine((value) => Object.keys(value).length > 0, 'At least one field is required'),
  params: z.object({
    workflowRuleId: objectIdSchema,
  }),
  query: emptyObject,
});

export const getWorkflowRuleSchema = z.object({
  body: emptyObject,
  params: z.object({
    workflowRuleId: objectIdSchema,
  }),
  query: emptyObject,
});

export const listWorkflowRuleSchema = z.object({
  body: emptyObject,
  params: emptyObject,
  query: z
    .object({
      daoId: objectIdSchema.optional(),
      flowId: objectIdSchema.optional(),
      enabled: z.coerce.boolean().optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    })
    .superRefine((value, ctx) => {
      if (!value.daoId && !value.flowId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['flowId'],
          message: 'flowId or daoId is required',
        });
      }
    }),
});

export const listWorkflowEventSchema = z.object({
  body: emptyObject,
  params: z.object({
    workflowRuleId: objectIdSchema,
  }),
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

export const evaluateWorkflowRulesSchema = z.object({
  body: emptyObject,
  params: emptyObject,
  query: emptyObject,
});
