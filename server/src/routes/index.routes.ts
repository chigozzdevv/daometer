import { Router } from 'express';
import { authRouter } from '@/features/auth/auth.routes';
import { automationRouter } from '@/features/automation/automation.routes';
import { daoRouter } from '@/features/dao/dao.routes';
import { executionJobRouter } from '@/features/execution-job/execution-job.routes';
import { flowRouter } from '@/features/flow/flow.routes';
import { proposalRouter } from '@/features/proposal/proposal.routes';
import { workflowRouter } from '@/features/workflow/workflow.routes';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/daos', daoRouter);
apiRouter.use('/flows', flowRouter);
apiRouter.use('/proposals', proposalRouter);
apiRouter.use('/execution-jobs', executionJobRouter);
apiRouter.use('/automation', automationRouter);
apiRouter.use('/workflows', workflowRouter);
