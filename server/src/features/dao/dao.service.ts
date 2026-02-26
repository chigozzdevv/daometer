import { Types } from 'mongoose';
import { env } from '@/config/env.config';
import { DaoModel, type DaoDocument } from '@/features/dao/dao.model';
import { AppError } from '@/shared/errors/app-error';
import { toSlug } from '@/shared/utils/slug.util';

type CreateDaoInput = {
  name: string;
  description?: string;
  network: 'mainnet-beta' | 'devnet';
  realmAddress: string;
  governanceProgramId: string;
  authorityWallet: string;
  communityMint?: string;
  councilMint?: string;
  slug?: string;
  automationConfig?: {
    autoExecuteEnabled?: boolean;
    maxRiskScore?: number;
    requireSimulation?: boolean;
  };
};

type UpdateDaoInput = {
  name?: string;
  description?: string;
  automationConfig?: {
    autoExecuteEnabled?: boolean;
    maxRiskScore?: number;
    requireSimulation?: boolean;
  };
};

export const createDao = async (input: CreateDaoInput, userId: Types.ObjectId): Promise<DaoDocument> => {
  const slug = input.slug ? toSlug(input.slug) : toSlug(input.name);

  const existingDao = await DaoModel.findOne({ $or: [{ slug }, { realmAddress: input.realmAddress }] });

  if (existingDao) {
    if (existingDao.slug === slug) {
      throw new AppError('DAO slug already exists', 409, 'DAO_SLUG_EXISTS');
    }

    throw new AppError('DAO realm address already exists', 409, 'DAO_REALM_EXISTS');
  }

  return DaoModel.create({
    name: input.name,
    slug,
    description: input.description ?? '',
    network: input.network,
    realmAddress: input.realmAddress,
    governanceProgramId: input.governanceProgramId,
    authorityWallet: input.authorityWallet,
    communityMint: input.communityMint,
    councilMint: input.councilMint,
    createdBy: userId,
    automationConfig: {
      autoExecuteEnabled: input.automationConfig?.autoExecuteEnabled ?? true,
      maxRiskScore: input.automationConfig?.maxRiskScore ?? env.AUTO_EXECUTION_DEFAULT_RISK_SCORE,
      requireSimulation: input.automationConfig?.requireSimulation ?? true,
    },
  });
};

export const listDaos = async ({ page, limit, search }: { page: number; limit: number; search?: string }) => {
  const filter = search
    ? {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { slug: { $regex: search, $options: 'i' } },
          { realmAddress: { $regex: search, $options: 'i' } },
        ],
      }
    : {};

  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    DaoModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    DaoModel.countDocuments(filter),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const getDaoById = async (daoId: string): Promise<DaoDocument> => {
  const dao = await DaoModel.findById(daoId);

  if (!dao) {
    throw new AppError('DAO not found', 404, 'DAO_NOT_FOUND');
  }

  return dao;
};

export const updateDao = async (daoId: string, input: UpdateDaoInput, userId: Types.ObjectId): Promise<DaoDocument> => {
  const dao = await DaoModel.findById(daoId);

  if (!dao) {
    throw new AppError('DAO not found', 404, 'DAO_NOT_FOUND');
  }

  if (!dao.createdBy.equals(userId)) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }

  if (input.name) {
    dao.name = input.name;
  }

  if (input.description !== undefined) {
    dao.description = input.description;
  }

  if (input.automationConfig) {
    dao.automationConfig = {
      autoExecuteEnabled: input.automationConfig.autoExecuteEnabled ?? dao.automationConfig.autoExecuteEnabled,
      maxRiskScore: input.automationConfig.maxRiskScore ?? dao.automationConfig.maxRiskScore,
      requireSimulation: input.automationConfig.requireSimulation ?? dao.automationConfig.requireSimulation,
    };
  }

  await dao.save();
  return dao;
};
