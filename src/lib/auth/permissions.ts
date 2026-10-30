/**
 * Permission check utility
 */

import { prisma } from '@/lib/prisma';
import { AppRole } from '@/types/auth';

/**
 * Check whether a user has a specific role
 * @param userId User ID
 * @param allowedRoles List of allowed roles
 * @returns boolean
 */
export async function hasRole(userId: string, allowedRoles: AppRole[]): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  return user ? allowedRoles.includes(user.role as AppRole) : false;
}

/**
 * Check whether a user has access permission to a specific Cluster
 * @param userId User ID
 * @param clusterId Cluster ID
 * @returns boolean
 */
export async function hasClusterPermission(
  userId: string,
  clusterId: string
): Promise<boolean> {
  const access = await prisma.userClusterAccess.findUnique({
    where: {
      userId_clusterId: { userId, clusterId },
    },
    select: { id: true },
  });

  return !!access;
}
