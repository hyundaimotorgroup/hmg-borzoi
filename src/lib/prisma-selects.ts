import { Prisma } from '@prisma/client';

/**
 * Safe select for UserClusterAccess responses sent to the client.
 * Excludes `chPassword` (encrypted ClickHouse credential) — API responses
 * should never round-trip stored credentials, encrypted or not.
 */
export const USER_CLUSTER_ACCESS_SAFE_SELECT = {
  id: true,
  userId: true,
  clusterId: true,
  chUsername: true,
  createdAt: true,
  cluster: {
    select: {
      id: true,
      name: true,
      environment: true,
    },
  },
} satisfies Prisma.UserClusterAccessSelect;
