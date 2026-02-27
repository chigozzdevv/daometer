import { connectDatabase, disconnectDatabase } from '@/config/database.config';
import { logger } from '@/config/logger.config';
import { UserModel, type UserRole } from '@/features/auth/auth.model';
import { DaoModel } from '@/features/dao/dao.model';
import { createDao } from '@/features/dao/dao.service';
import { FlowModel } from '@/features/flow/flow.model';
import { createFlow, publishFlow } from '@/features/flow/flow.service';

const seedAdminWalletAddress = '9sVvS5dKv93wXZ8wUeC8v9dS2HgN4V64dAt4E6C5VpjR';

const seed = async (): Promise<void> => {
  await connectDatabase();

  let adminUser = await UserModel.findOne({ walletAddress: seedAdminWalletAddress });

  if (!adminUser) {
    adminUser = await UserModel.create({
      walletAddress: seedAdminWalletAddress,
      displayName: 'Daometer Admin',
      roles: ['admin'],
    });
    logger.info({ userId: adminUser.id }, 'Created seed admin user');
  }

  if (!adminUser) {
    throw new Error('Unable to initialize admin user');
  }

  if (!adminUser.roles.includes('admin')) {
    adminUser.roles = [...new Set([...adminUser.roles, 'admin'])] as UserRole[];
    await adminUser.save();
  }

  const existingDao = await DaoModel.findOne({ slug: 'demo-realm' });

  const dao =
    existingDao ??
    (await createDao(
      {
        name: 'Demo Realm',
        slug: 'demo-realm',
        description: 'Seeded DAO for local testing',
        network: 'devnet',
        realmAddress: '8J4f4w2RMze1fQFANfBYwSh3wH6j6qUE7YGnPZXoqBYb',
        governanceProgramId: 'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw',
        authorityWallet: '7h2EzkpUmVtV6rur6LiW9aQfPwA7fN3H8mE2Caxvsf9C',
        communityMint: '9vM7N34fK5QfyYmk5nsy6m6xTTDhL95B2S7R1CV2wAPh',
      },
      adminUser._id,
    ));

  const existingFlow = await FlowModel.findOne({ daoId: dao._id, slug: 'treasury-safety-flow' });

  const flow =
    existingFlow ??
    (await createFlow(
      {
        daoId: dao.id,
        name: 'Treasury Safety Flow',
        description: 'Seed flow with transfer + config blocks',
        tags: ['seed', 'treasury'],
        blocks: [
          {
            id: 'transfer-1',
            type: 'transfer-sol',
            label: 'Initial contributor payment',
            fromGovernance: '7h2EzkpUmVtV6rur6LiW9aQfPwA7fN3H8mE2Caxvsf9C',
            toWallet: '3j6fXQY8j1Y4dhh7i95Vh9F6CC6LJeN3M8X3LQm8Zzn2',
            lamports: 1_500_000_000,
          },
          {
            id: 'config-1',
            type: 'set-governance-config',
            label: 'Raise threshold to 60%',
            governanceAddress: '7h2EzkpUmVtV6rur6LiW9aQfPwA7fN3H8mE2Caxvsf9C',
            yesVoteThresholdPercent: 60,
            baseVotingTimeSeconds: 3 * 24 * 3600,
            minInstructionHoldUpTimeSeconds: 3600,
          },
        ],
        proposalDefaults: {
          titlePrefix: 'Seed Proposal',
          votingDurationHours: 48,
          holdUpSeconds: 3600,
          maxRiskScore: 75,
        },
      },
      adminUser._id,
    ));

  const alreadyPublished = flow.lastPublishedProposalId !== null;

  if (!alreadyPublished) {
    const publishResult = await publishFlow(flow.id, adminUser._id, {
      title: 'Seeded treasury and governance update',
      description: 'Generated from seed flow',
    });

    logger.info({ proposalId: publishResult.proposalId }, 'Published seed flow to proposal');
  }

  logger.info({ daoId: dao.id, flowId: flow.id }, 'Seed completed');

  await disconnectDatabase();
};

seed().catch(async (error) => {
  logger.error({ err: error }, 'Seed failed');
  await disconnectDatabase();
  process.exit(1);
});
