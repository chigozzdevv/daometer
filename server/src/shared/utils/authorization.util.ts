import { Types } from 'mongoose';
import { UserModel } from '@/features/auth/auth.model';
import { DaoModel, type DaoDocument } from '@/features/dao/dao.model';
import { AppError } from '@/shared/errors/app-error';

const getUserRoles = async (userId: Types.ObjectId): Promise<string[]> => {
  const user = await UserModel.findById(userId).select('roles');

  if (!user) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  return user.roles;
};

export const isAdminUser = async (userId: Types.ObjectId): Promise<boolean> => {
  const roles = await getUserRoles(userId);
  return roles.includes('admin');
};

export const assertAdminUser = async (userId: Types.ObjectId): Promise<void> => {
  const isAdmin = await isAdminUser(userId);

  if (!isAdmin) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }
};

export const assertCanManageDao = async (
  daoId: Types.ObjectId | string,
  userId: Types.ObjectId,
): Promise<DaoDocument> => {
  const [dao, isAdmin] = await Promise.all([DaoModel.findById(daoId), isAdminUser(userId)]);

  if (!dao) {
    throw new AppError('DAO not found', 404, 'DAO_NOT_FOUND');
  }

  if (!isAdmin && !dao.createdBy.equals(userId)) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }

  return dao;
};
