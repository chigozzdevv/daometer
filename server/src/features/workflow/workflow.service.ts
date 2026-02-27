import { Types } from 'mongoose';
import { ExecutionJobModel } from '@/features/execution-job/execution-job.model';
import { scheduleExecutionJobFromProposal } from '@/features/execution-job/execution-job.service';
import { FlowModel } from '@/features/flow/flow.model';
import { ProposalModel, type ProposalDocument } from '@/features/proposal/proposal.model';
import {
  WorkflowEventModel,
  WorkflowRuleModel,
  type WorkflowAction,
  type WorkflowActionResult,
  type WorkflowConditionGroup,
  type WorkflowRuleDocument,
  type WorkflowTrigger,
} from '@/features/workflow/workflow.model';
import { sendEmailWithResend } from '@/shared/integrations/resend.client';
import { AppError } from '@/shared/errors/app-error';
import { assertAdminUser, assertCanManageDao } from '@/shared/utils/authorization.util';

type CreateWorkflowRuleInput = {
  flowId: string;
  name: string;
  description?: string;
  enabled?: boolean;
  trigger: WorkflowTrigger;
  filters?: {
    voteScope?: 'community' | 'council' | null;
    minRiskScore?: number | null;
    maxRiskScore?: number | null;
    onchainExecutionEnabled?: boolean | null;
    proposalId?: string | null;
  };
  conditions?: WorkflowConditionGroup;
  actions: {
    onTrue: WorkflowAction[];
    onFalse: WorkflowAction[];
  };
};

type UpdateWorkflowRuleInput = Partial<Omit<CreateWorkflowRuleInput, 'daoId'>>;

type ListWorkflowRulesInput = {
  daoId?: string;
  flowId?: string;
  enabled?: boolean;
  page: number;
  limit: number;
};

type ListWorkflowEventsInput = {
  workflowRuleId: string;
  page: number;
  limit: number;
};

type WorkflowContext = {
  proposal: {
    id: string;
    title: string;
    sourceFlowId: string | null;
    state: string;
    voteScope: string;
    riskScore: number;
    holdUpSeconds: number;
    onchainEnabled: boolean;
    autoExecute: boolean;
    hasExecutionError: boolean;
    manualApprovalRequired: boolean;
    manualApprovalApproved: boolean | null;
    votingEndsAt: string;
    succeededAt: string | null;
  };
  trigger: {
    type: string;
    key: string;
  };
  metrics: {
    hoursToVotingEnd: number | null;
    hoursToHoldUpExpiry: number | null;
  };
  daoId: string;
  nowIso: string;
};

type EvaluateWorkflowSummary = {
  rulesChecked: number;
  proposalsEvaluated: number;
  eventsCreated: number;
  actionsExecuted: number;
  failures: number;
};

const toErrorMessage = (error: unknown): string => (error instanceof Error ? error.message : 'Unknown workflow error');

const resolveTemplateValue = (context: WorkflowContext, token: string): string => {
  const [root, ...rest] = token.split('.');

  const rootValue = (context as Record<string, unknown>)[root];

  if (rest.length === 0) {
    return rootValue === undefined || rootValue === null ? '' : String(rootValue);
  }

  let current: unknown = rootValue;

  for (const segment of rest) {
    if (!current || typeof current !== 'object') {
      return '';
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current === undefined || current === null ? '' : String(current);
};

const renderTemplate = (template: string, context: WorkflowContext): string =>
  template.replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (_match, token: string) => resolveTemplateValue(context, token));

const getConditionFieldValue = (field: string, context: WorkflowContext): unknown => {
  switch (field) {
    case 'state':
      return context.proposal.state;
    case 'voteScope':
      return context.proposal.voteScope;
    case 'riskScore':
      return context.proposal.riskScore;
    case 'holdUpSeconds':
      return context.proposal.holdUpSeconds;
    case 'onchainEnabled':
      return context.proposal.onchainEnabled;
    case 'autoExecute':
      return context.proposal.autoExecute;
    case 'hasExecutionError':
      return context.proposal.hasExecutionError;
    case 'manualApprovalRequired':
      return context.proposal.manualApprovalRequired;
    case 'manualApprovalApproved':
      return context.proposal.manualApprovalApproved;
    case 'hoursToVotingEnd':
      return context.metrics.hoursToVotingEnd;
    case 'hoursToHoldUpExpiry':
      return context.metrics.hoursToHoldUpExpiry;
    case 'daoId':
      return context.daoId;
    case 'sourceFlowId':
      return context.proposal.sourceFlowId;
    default:
      return null;
  }
};

const evaluateConditionRule = (fieldValue: unknown, operator: string, expectedValue: unknown): boolean => {
  if (operator === 'eq') {
    return fieldValue === expectedValue;
  }

  if (operator === 'neq') {
    return fieldValue !== expectedValue;
  }

  if (operator === 'gt') {
    return Number(fieldValue) > Number(expectedValue);
  }

  if (operator === 'gte') {
    return Number(fieldValue) >= Number(expectedValue);
  }

  if (operator === 'lt') {
    return Number(fieldValue) < Number(expectedValue);
  }

  if (operator === 'lte') {
    return Number(fieldValue) <= Number(expectedValue);
  }

  if (operator === 'in') {
    return Array.isArray(expectedValue) ? expectedValue.includes(fieldValue) : false;
  }

  if (operator === 'not-in') {
    return Array.isArray(expectedValue) ? !expectedValue.includes(fieldValue) : false;
  }

  if (operator === 'contains') {
    if (Array.isArray(fieldValue)) {
      return fieldValue.includes(expectedValue);
    }

    if (typeof fieldValue === 'string') {
      return fieldValue.includes(String(expectedValue));
    }

    return false;
  }

  return false;
};

const evaluateConditionGroup = (conditionGroup: WorkflowConditionGroup, context: WorkflowContext): boolean => {
  if (conditionGroup.rules.length === 0) {
    return true;
  }

  const checks = conditionGroup.rules.map((rule) =>
    evaluateConditionRule(getConditionFieldValue(rule.field, context), rule.operator, rule.value),
  );

  return conditionGroup.mode === 'all' ? checks.every(Boolean) : checks.some(Boolean);
};

const getHoldUpExpiryDate = (proposal: ProposalDocument): Date | null => {
  if (!proposal.succeededAt) {
    return null;
  }

  return new Date(proposal.succeededAt.getTime() + proposal.holdUpSeconds * 1000);
};

const getTriggerEvaluation = (
  trigger: WorkflowTrigger,
  proposal: ProposalDocument,
  now: Date,
): { due: boolean; triggerKey: string } => {
  if (trigger.type === 'proposal-state-changed') {
    return {
      due: trigger.states.includes(proposal.state),
      triggerKey: `state:${proposal.state}`,
    };
  }

  if (trigger.type === 'voting-ends-in') {
    const diffMs = proposal.votingEndsAt.getTime() - now.getTime();
    const due = diffMs >= 0 && diffMs <= trigger.offsetMinutes * 60 * 1000;

    return {
      due,
      triggerKey: `voting-ends-in:${trigger.offsetMinutes}`,
    };
  }

  const holdUpExpiry = getHoldUpExpiryDate(proposal);

  if (!holdUpExpiry) {
    return {
      due: false,
      triggerKey: `hold-up-expires-in:${trigger.offsetMinutes}`,
    };
  }

  const diffMs = holdUpExpiry.getTime() - now.getTime();

  return {
    due: diffMs >= 0 && diffMs <= trigger.offsetMinutes * 60 * 1000,
    triggerKey: `hold-up-expires-in:${trigger.offsetMinutes}`,
  };
};

const buildProposalContext = (proposal: ProposalDocument, triggerType: string, triggerKey: string, now: Date): WorkflowContext => {
  const holdUpExpiry = getHoldUpExpiryDate(proposal);

  return {
    proposal: {
      id: proposal.id,
      title: proposal.title,
      sourceFlowId: proposal.sourceFlowId ? proposal.sourceFlowId.toString() : null,
      state: proposal.state,
      voteScope: proposal.voteScope,
      riskScore: proposal.riskScore,
      holdUpSeconds: proposal.holdUpSeconds,
      onchainEnabled: proposal.onchainExecution.enabled,
      autoExecute: proposal.automation.autoExecute,
      hasExecutionError: Boolean(proposal.executionError),
      manualApprovalRequired: proposal.manualApproval?.required ?? false,
      manualApprovalApproved: proposal.manualApproval?.approved ?? null,
      votingEndsAt: proposal.votingEndsAt.toISOString(),
      succeededAt: proposal.succeededAt ? proposal.succeededAt.toISOString() : null,
    },
    trigger: {
      type: triggerType,
      key: triggerKey,
    },
    metrics: {
      hoursToVotingEnd: (proposal.votingEndsAt.getTime() - now.getTime()) / (60 * 60 * 1000),
      hoursToHoldUpExpiry: holdUpExpiry ? (holdUpExpiry.getTime() - now.getTime()) / (60 * 60 * 1000) : null,
    },
    daoId: proposal.daoId.toString(),
    nowIso: now.toISOString(),
  };
};

const buildProposalFilterForRule = (rule: WorkflowRuleDocument): Record<string, unknown> => {
  const filter: Record<string, unknown> = {
    daoId: rule.daoId,
    sourceFlowId: rule.flowId,
  };

  if (rule.trigger.type === 'proposal-state-changed') {
    filter.state = { $in: rule.trigger.states };
  }

  if (rule.trigger.type === 'voting-ends-in') {
    filter.state = 'voting';
  }

  if (rule.trigger.type === 'hold-up-expires-in') {
    filter.state = 'succeeded';
    filter.succeededAt = { $ne: null };
  }

  if (rule.filters.voteScope) {
    filter.voteScope = rule.filters.voteScope;
  }

  if (rule.filters.minRiskScore !== null && rule.filters.minRiskScore !== undefined) {
    filter.riskScore = {
      ...(filter.riskScore as Record<string, unknown> | undefined),
      $gte: rule.filters.minRiskScore,
    };
  }

  if (rule.filters.maxRiskScore !== null && rule.filters.maxRiskScore !== undefined) {
    filter.riskScore = {
      ...(filter.riskScore as Record<string, unknown> | undefined),
      $lte: rule.filters.maxRiskScore,
    };
  }

  if (rule.filters.onchainExecutionEnabled !== null && rule.filters.onchainExecutionEnabled !== undefined) {
    filter['onchainExecution.enabled'] = rule.filters.onchainExecutionEnabled;
  }

  if (rule.filters.proposalId && Types.ObjectId.isValid(rule.filters.proposalId)) {
    filter._id = new Types.ObjectId(rule.filters.proposalId);
  }

  return filter;
};

const executeWorkflowAction = async (
  action: WorkflowAction,
  proposal: ProposalDocument,
  context: WorkflowContext,
  now: Date,
): Promise<WorkflowActionResult> => {
  if (!action.enabled) {
    return {
      type: action.type,
      status: 'skipped',
      message: 'Action is disabled',
    };
  }

  if (action.type === 'send-email') {
    const to = Array.isArray(action.config.to) ? action.config.to.map(String).filter(Boolean) : [];
    const subjectTemplate = String(action.config.subject ?? 'DAO Workflow Notification: {{proposal.title}}');
    const bodyTemplate = String(
      action.config.body ?? 'Proposal "{{proposal.title}}" is currently in "{{proposal.state}}" state.',
    );

    const subject = renderTemplate(subjectTemplate, context);
    const body = renderTemplate(bodyTemplate, context);
    const html = body.replace(/\n/g, '<br/>');
    const response = await sendEmailWithResend({ to, subject, html });

    return {
      type: action.type,
      status: 'success',
      message: 'Email sent',
      details: { resendId: response.id, toCount: to.length },
    };
  }

  if (action.type === 'enqueue-execution') {
    const executionJob = await scheduleExecutionJobFromProposal(proposal, now);

    return {
      type: action.type,
      status: executionJob ? 'success' : 'skipped',
      message: executionJob ? 'Execution job queued' : 'Proposal is not eligible for execution queue',
      details: executionJob ? { executionJobId: executionJob.id, status: executionJob.status } : undefined,
    };
  }

  if (action.type === 'set-manual-approval') {
    const required = Boolean(action.config.required ?? true);
    const note = action.config.note ? String(action.config.note) : null;

    proposal.manualApproval = {
      required,
      approved: required ? false : null,
      approvedBy: null,
      approvedAt: null,
      note,
    };

    await proposal.save();

    return {
      type: action.type,
      status: 'success',
      message: required ? 'Manual approval required' : 'Manual approval disabled',
      details: { required, note },
    };
  }

  if (action.type === 'execute-now') {
    const executionJob = await scheduleExecutionJobFromProposal(proposal, now);

    if (!executionJob) {
      return {
        type: action.type,
        status: 'skipped',
        message: 'Proposal is not eligible for execution',
      };
    }

    if (executionJob.status === 'pending') {
      executionJob.nextRunAt = now;
      executionJob.lockedBy = null;
      executionJob.lockExpiresAt = null;
      await executionJob.save();
    }

    return {
      type: action.type,
      status: 'success',
      message: 'Execution job prioritized for immediate processing',
      details: { executionJobId: executionJob.id, status: executionJob.status },
    };
  }

  return {
    type: action.type,
    status: 'skipped',
    message: 'Unsupported action type',
  };
};

const reserveWorkflowEvent = async (payload: {
  workflowRuleId: Types.ObjectId;
  daoId: Types.ObjectId;
  proposalId: Types.ObjectId;
  triggerType: WorkflowTrigger['type'];
  triggerKey: string;
  context: WorkflowContext;
  firedAt: Date;
}): Promise<boolean> => {
  const result = await WorkflowEventModel.updateOne(
    {
      workflowRuleId: payload.workflowRuleId,
      proposalId: payload.proposalId,
      triggerKey: payload.triggerKey,
    },
    {
      $setOnInsert: {
        workflowRuleId: payload.workflowRuleId,
        daoId: payload.daoId,
        proposalId: payload.proposalId,
        triggerType: payload.triggerType,
        triggerKey: payload.triggerKey,
        matched: false,
        actionResults: [],
        context: payload.context,
        error: null,
        firedAt: payload.firedAt,
      },
    },
    { upsert: true },
  );

  return result.upsertedCount === 1;
};

const finalizeWorkflowEvent = async (payload: {
  workflowRuleId: Types.ObjectId;
  proposalId: Types.ObjectId;
  triggerKey: string;
  matched: boolean;
  actionResults: WorkflowActionResult[];
  context: WorkflowContext;
  error: string | null;
  firedAt: Date;
}): Promise<void> => {
  await WorkflowEventModel.updateOne(
    {
      workflowRuleId: payload.workflowRuleId,
      proposalId: payload.proposalId,
      triggerKey: payload.triggerKey,
    },
    {
      $set: {
        matched: payload.matched,
        actionResults: payload.actionResults,
        context: payload.context,
        error: payload.error,
        firedAt: payload.firedAt,
      },
    },
  );
};

export const createWorkflowRule = async (input: CreateWorkflowRuleInput, userId: Types.ObjectId): Promise<WorkflowRuleDocument> => {
  const flow = await FlowModel.findById(input.flowId).select('daoId');

  if (!flow) {
    throw new AppError('Flow not found', 404, 'FLOW_NOT_FOUND');
  }

  await assertCanManageDao(flow.daoId, userId);

  return WorkflowRuleModel.create({
    daoId: flow.daoId,
    flowId: flow._id,
    name: input.name,
    description: input.description ?? '',
    enabled: input.enabled ?? true,
    trigger: input.trigger,
    filters: {
      voteScope: input.filters?.voteScope ?? null,
      minRiskScore: input.filters?.minRiskScore ?? null,
      maxRiskScore: input.filters?.maxRiskScore ?? null,
      onchainExecutionEnabled: input.filters?.onchainExecutionEnabled ?? null,
      proposalId: input.filters?.proposalId ?? null,
    },
    conditions: input.conditions ?? {
      mode: 'all',
      rules: [],
    },
    actions: input.actions,
    createdBy: userId,
    updatedBy: userId,
  });
};

export const listWorkflowRules = async (
  input: ListWorkflowRulesInput,
  userId: Types.ObjectId,
): Promise<{
  items: WorkflowRuleDocument[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}> => {
  const filter: Record<string, unknown> = {};

  if (input.flowId) {
    const flow = await FlowModel.findById(input.flowId).select('daoId');

    if (!flow) {
      throw new AppError('Flow not found', 404, 'FLOW_NOT_FOUND');
    }

    await assertCanManageDao(flow.daoId, userId);
    filter.flowId = flow._id;
  } else if (input.daoId) {
    await assertCanManageDao(input.daoId, userId);
    filter.daoId = new Types.ObjectId(input.daoId);
  } else {
    throw new AppError('flowId or daoId is required', 400, 'WORKFLOW_SCOPE_REQUIRED');
  }

  if (typeof input.enabled === 'boolean') {
    filter.enabled = input.enabled;
  }

  const skip = (input.page - 1) * input.limit;

  const [items, total] = await Promise.all([
    WorkflowRuleModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(input.limit),
    WorkflowRuleModel.countDocuments(filter),
  ]);

  return {
    items,
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.ceil(total / input.limit),
    },
  };
};

export const getWorkflowRuleById = async (workflowRuleId: string, userId: Types.ObjectId): Promise<WorkflowRuleDocument> => {
  const workflowRule = await WorkflowRuleModel.findById(workflowRuleId);

  if (!workflowRule) {
    throw new AppError('Workflow rule not found', 404, 'WORKFLOW_RULE_NOT_FOUND');
  }

  await assertCanManageDao(workflowRule.daoId, userId);
  return workflowRule;
};

export const updateWorkflowRule = async (
  workflowRuleId: string,
  input: UpdateWorkflowRuleInput,
  userId: Types.ObjectId,
): Promise<WorkflowRuleDocument> => {
  const workflowRule = await WorkflowRuleModel.findById(workflowRuleId);

  if (!workflowRule) {
    throw new AppError('Workflow rule not found', 404, 'WORKFLOW_RULE_NOT_FOUND');
  }

  await assertCanManageDao(workflowRule.daoId, userId);

  if (input.name !== undefined) {
    workflowRule.name = input.name;
  }

  if (input.description !== undefined) {
    workflowRule.description = input.description;
  }

  if (input.enabled !== undefined) {
    workflowRule.enabled = input.enabled;
  }

  if (input.trigger !== undefined) {
    workflowRule.trigger = input.trigger;
  }

  if (input.filters !== undefined) {
    workflowRule.filters = {
      voteScope: input.filters.voteScope ?? null,
      minRiskScore: input.filters.minRiskScore ?? null,
      maxRiskScore: input.filters.maxRiskScore ?? null,
      onchainExecutionEnabled: input.filters.onchainExecutionEnabled ?? null,
      proposalId: input.filters.proposalId ?? null,
    };
  }

  if (input.conditions !== undefined) {
    workflowRule.conditions = input.conditions;
  }

  if (input.actions !== undefined) {
    workflowRule.actions = input.actions;
  }

  workflowRule.updatedBy = userId;
  await workflowRule.save();
  return workflowRule;
};

export const listWorkflowEvents = async (
  input: ListWorkflowEventsInput,
  userId: Types.ObjectId,
): Promise<{
  items: Awaited<ReturnType<typeof WorkflowEventModel.find>>;
  pagination: { page: number; limit: number; total: number; totalPages: number };
}> => {
  const workflowRule = await WorkflowRuleModel.findById(input.workflowRuleId).select('daoId');

  if (!workflowRule) {
    throw new AppError('Workflow rule not found', 404, 'WORKFLOW_RULE_NOT_FOUND');
  }

  await assertCanManageDao(workflowRule.daoId, userId);

  const skip = (input.page - 1) * input.limit;
  const filter = { workflowRuleId: workflowRule._id };

  const [items, total] = await Promise.all([
    WorkflowEventModel.find(filter).sort({ firedAt: -1 }).skip(skip).limit(input.limit),
    WorkflowEventModel.countDocuments(filter),
  ]);

  return {
    items,
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.ceil(total / input.limit),
    },
  };
};

export const evaluateWorkflowRules = async (_workerId: string, now = new Date()): Promise<EvaluateWorkflowSummary> => {
  const rules = await WorkflowRuleModel.find({ enabled: true }).limit(200);

  const summary: EvaluateWorkflowSummary = {
    rulesChecked: rules.length,
    proposalsEvaluated: 0,
    eventsCreated: 0,
    actionsExecuted: 0,
    failures: 0,
  };

  for (const rule of rules) {
    const proposalFilter = buildProposalFilterForRule(rule);
    const proposals = await ProposalModel.find(proposalFilter).sort({ updatedAt: -1 }).limit(300);

    for (const proposal of proposals) {
      summary.proposalsEvaluated += 1;

      const triggerEvaluation = getTriggerEvaluation(rule.trigger, proposal, now);

      if (!triggerEvaluation.due) {
        continue;
      }

      const context = buildProposalContext(proposal, rule.trigger.type, triggerEvaluation.triggerKey, now);
      const matched = evaluateConditionGroup(rule.conditions, context);
      const actions = matched ? rule.actions.onTrue : rule.actions.onFalse;
      const actionResults: WorkflowActionResult[] = [];

      let workflowError: string | null = null;

      const reserved = await reserveWorkflowEvent({
        workflowRuleId: rule._id,
        daoId: rule.daoId,
        proposalId: proposal._id,
        triggerType: rule.trigger.type,
        triggerKey: triggerEvaluation.triggerKey,
        context,
        firedAt: now,
      });

      if (!reserved) {
        continue;
      }

      for (const action of actions) {
        try {
          const actionResult = await executeWorkflowAction(action, proposal, context, now);
          actionResults.push(actionResult);

          if (actionResult.status !== 'skipped') {
            summary.actionsExecuted += 1;
          }
        } catch (error) {
          const message = toErrorMessage(error);
          actionResults.push({
            type: action.type,
            status: 'failed',
            message,
          });

          workflowError = workflowError ? `${workflowError}; ${message}` : message;
          summary.failures += 1;
        }
      }

      try {
        await finalizeWorkflowEvent({
          workflowRuleId: rule._id,
          proposalId: proposal._id,
          triggerKey: triggerEvaluation.triggerKey,
          matched,
          actionResults,
          context,
          error: workflowError,
          firedAt: now,
        });
        summary.eventsCreated += 1;
      } catch (error) {
        summary.failures += 1;
      }
    }
  }

  return summary;
};

export const runWorkflowEvaluationManually = async (userId: Types.ObjectId): Promise<EvaluateWorkflowSummary> => {
  await assertAdminUser(userId);
  const workerId = `manual-workflow-${userId.toString()}`;
  return evaluateWorkflowRules(workerId);
};
