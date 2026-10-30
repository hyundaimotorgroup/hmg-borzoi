import { prisma } from "@/lib/prisma";
import { credentialCache } from "@/lib/cache/credential-cache";
import { clickHouseClientPool } from "@/lib/cache/client-pool";

export interface ProvisionedUser {
  id: string;
  email: string;
  name: string;
  role: string;
  ssoAdminGrantedAt: Date | null;
}

const PROVISIONED_USER_SELECT = { id: true, email: true, name: true, role: true, ssoAdminGrantedAt: true } as const;

/**
 * Resolves the User for an OIDC identity, keyed by (issuer, subject) rather
 * than email — a JWT `sub` is permanent for the life of the account at that
 * IdP, while email can change or be reassigned to someone else. Email is only
 * consulted the first time this (issuer, subject) is seen, to link an
 * existing password/prior-SSO account or create a new one; every later login
 * for the same identity resolves directly through ExternalIdentity and never
 * touches email matching again, so a subsequent email change or reuse at the
 * IdP can't reassign the account.
 *
 * `name` is kept in sync with the IdP on every login (first link and every
 * login after), unlike email/role/password which are only ever set at
 * creation — a display name has no security implications the way those do,
 * so there's no reason to let it go stale.
 */
export async function resolveSsoUser(params: {
  issuer: string;
  subject: string;
  email: string;
  name: string;
}): Promise<ProvisionedUser> {
  const { issuer, subject, email, name } = params;

  const existingIdentity = await prisma.externalIdentity.findUnique({
    where: { issuer_subject: { issuer, subject } },
    select: { user: { select: PROVISIONED_USER_SELECT } },
  });

  if (existingIdentity) {
    const user = existingIdentity.user;
    if (user.name === name) {
      return user;
    }
    return prisma.user.update({
      where: { id: user.id },
      data: { name },
      select: PROVISIONED_USER_SELECT,
    });
  }

  // First time seeing this (issuer, subject): link to an existing account by
  // email or create a new one — same defaults as /api/auth/register — and
  // bind the identity in the same transaction, so a losing race below never
  // leaves an orphaned user row committed on its own.
  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { email },
        update: { name },
        create: { email, name, role: "viewer", password: null },
        select: PROVISIONED_USER_SELECT,
      });
      await tx.externalIdentity.create({ data: { issuer, subject, userId: user.id } });
      return user;
    });
  } catch (error) {
    // Two concurrent first-logins for the same identity (e.g. a double-clicked
    // SSO button, or the email claim itself changing between two near-simultaneous
    // logins) both reach here; the loser's insert hits the unique constraint and
    // its whole transaction rolls back. Resolve to whoever actually won the race
    // — NOT the (possibly different, if the email differed) user this request
    // would have upserted — so the session issued below always matches the
    // identity that's actually bound.
    const bound = await prisma.externalIdentity.findUnique({
      where: { issuer_subject: { issuer, subject } },
      select: { user: { select: PROVISIONED_USER_SELECT } },
    });
    if (!bound) {
      throw error;
    }
    return bound.user;
  }
}

/**
 * Whether this user has ever linked an SSO identity — used at logout time to
 * decide whether it's worth also redirecting through the IdP's RP-Initiated
 * Logout (see /api/auth/logout). A user who has only ever used password login
 * was never authenticated at the IdP, so there's nothing there to log out of.
 */
export async function hasExternalIdentity(userId: string): Promise<boolean> {
  const identity = await prisma.externalIdentity.findFirst({ where: { userId }, select: { id: true } });
  return identity !== null;
}

/**
 * Grants an SSO-listed admin email the admin role and backfills access to
 * every cluster it doesn't already have (once), copying each cluster's shared
 * (already-encrypted) credentials verbatim — same approach as the admin branch
 * of PUT /api/users/[id]/cluster-access — so the account has working access,
 * not just the role label.
 *
 * This is a one-time bootstrap, not a continuously-enforced source of truth:
 * `ssoAdminGrantedAt` is stamped on first grant and checked (not `role`) to
 * decide whether to act again, so a later manual demotion via the app-users UI
 * sticks even if the email stays on the list and the user keeps logging in.
 *
 * The role/marker update and the cluster-access grants commit as one
 * transaction — `ssoAdminGrantedAt` gates every future call, so if it were
 * stamped while the cluster grants failed partway, the account would be stuck
 * as an "admin" with missing access forever, with no way to retry.
 */
export async function ensureAdminPrivileges(user: ProvisionedUser, adminEmails: Set<string>): Promise<void> {
  if (user.ssoAdminGrantedAt || !adminEmails.has(user.email.toLowerCase())) {
    return;
  }

  const [clusters, existingAccess] = await Promise.all([
    prisma.cluster.findMany({ select: { id: true, username: true, password: true } }),
    prisma.userClusterAccess.findMany({ where: { userId: user.id }, select: { clusterId: true } }),
  ]);

  const existingClusterIds = new Set(existingAccess.map((access) => access.clusterId));
  const missingClusters = clusters.filter((cluster) => !existingClusterIds.has(cluster.id));

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { role: "admin", ssoAdminGrantedAt: new Date() },
    }),
    ...(missingClusters.length > 0
      ? [
          prisma.userClusterAccess.createMany({
            data: missingClusters.map((cluster) => ({
              userId: user.id,
              clusterId: cluster.id,
              chUsername: cluster.username,
              chPassword: cluster.password,
            })),
            skipDuplicates: true,
          }),
        ]
      : []),
  ]);

  for (const cluster of missingClusters) {
    credentialCache.invalidate(user.id, cluster.id);
    clickHouseClientPool.invalidateCluster(cluster.id);
  }
}
