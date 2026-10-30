import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { SessionUser } from '@/types/auth';
import { getSessionIdleTimeoutMs, getSessionMaxLifetimeMs } from '@/lib/feature-flags';
import { encryptSecret, decryptSecret } from '@/lib/crypto';
import { logger } from '@/lib/utils/logger';

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Creates a session, first revoking every other active session for this user
 * (single-session-per-account) — used by password login, registration, and
 * the SSO callback alike, so a new login anywhere always invalidates prior
 * ones regardless of which auth method created them. The revoke and the
 * create commit as one transaction so two logins racing each other can't
 * both end up with a live session for the same account.
 */
export async function createSession(
  userId: string,
  meta?: { ipAddress?: string | null; userAgent?: string | null; idToken?: string | null }
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + getSessionMaxLifetimeMs());
  // Encrypted at rest (AES-256-GCM, see src/lib/crypto.ts) — some providers
  // need this raw ID token as id_token_hint on RP-Initiated Logout, so it must
  // be retrievable, but it's still a bearer credential and shouldn't sit in
  // the DB in plaintext.
  const encryptedIdToken = meta?.idToken ? await encryptSecret(meta.idToken) : null;

  await prisma.$transaction([
    prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'superseded' },
    }),
    prisma.session.create({
      data: {
        tokenHash: hashToken(token),
        userId,
        expiresAt,
        ipAddress: meta?.ipAddress ?? null,
        userAgent: meta?.userAgent ?? null,
        idToken: encryptedIdToken,
      },
    }),
  ]);

  return { token, expiresAt };
}

/**
 * Read-only session/user lookup — called on every authenticated request
 * (51 API routes + all protected pages via getSession()), including passive
 * background polling the user never asked for (e.g. GlobalHeader's 30s alert
 * poll). Deliberately does NOT write lastActivityAt: if it did, that
 * background poll alone would keep resetting the idle clock forever, and the
 * idle timeout would never fire no matter how long the user was actually away
 * from the keyboard. Only touchSessionActivity() (called from a real DOM
 * input event, see AuthContext.tsx) is allowed to bump it.
 */
export async function getSessionUser(token: string): Promise<SessionUser | null> {
  if (!token) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      expiresAt: true,
      revokedAt: true,
      lastActivityAt: true,
      user: {
        select: { id: true, email: true, name: true, role: true },
      },
    },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    return null;
  }

  const idleTimeoutMs = getSessionIdleTimeoutMs();
  const idleMs = Date.now() - session.lastActivityAt.getTime();

  if (idleTimeoutMs > 0 && idleMs > idleTimeoutMs) {
    // Revoke outright rather than just treating this as "expired" — makes the
    // token permanently unusable (e.g. against a replayed/cached cookie)
    // instead of leaving it in an ambiguous not-quite-revoked state.
    await revokeSession(token, 'idle_timeout');
    return null;
  }

  return session.user;
}

export interface SessionOwner {
  user: SessionUser;
  /** Decrypted OIDC id_token from login, or null for a password session / IdP that didn't need one. */
  idToken: string | null;
}

/**
 * Looks up whose session this token belongs to WITHOUT enforcing validity
 * (revoked/absolute-expired/idle-expired) — for logout only, never for
 * authorizing access (use getSessionUser() for that).
 *
 * This matters specifically for an idle-timeout-triggered logout: the moment
 * the client's countdown reaches zero is, by construction, the same instant
 * getSessionUser()'s own idle check would revoke the session — so by the time
 * POST /api/auth/logout's handler ran, calling getSessionUser() would already
 * find the session revoked and return null, silently skipping SSO logout
 * (audit log too) with no account to attribute it to. That defeats idle
 * timeout's actual purpose: it exists to protect an unattended browser, and
 * an idle logout that leaves the IdP-side SSO session alive is no better than
 * not logging out at all.
 *
 * Also returns the session's decrypted id_token (if any) so logout can pass
 * it as id_token_hint to an IdP end-session endpoint that requires it, and by
 * this point in logout the raw token exists nowhere else.
 */
export async function getSessionOwner(token: string): Promise<SessionOwner | null> {
  if (!token) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { idToken: true, user: { select: { id: true, email: true, name: true, role: true } } },
  });

  if (!session) {
    return null;
  }

  let idToken: string | null = null;
  if (session.idToken) {
    try {
      idToken = await decryptSecret(session.idToken);
    } catch (error) {
      logger.error("Failed to decrypt session id_token:", error);
    }
  }

  return { user: session.user, idToken };
}

/**
 * Records real user activity (call only from a genuine input event handler,
 * throttled client-side — see AuthContext.tsx's activity listener). This is
 * the *only* place lastActivityAt is written; getSessionUser() above is
 * read-only specifically so that ordinary API traffic (including passive
 * background polling) can never masquerade as activity.
 */
export async function touchSessionActivity(token: string): Promise<void> {
  if (!token) {
    return;
  }

  await prisma.session.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { lastActivityAt: new Date() },
  });
}

/**
 * Read-only lookup of when this session will expire — the earlier of the
 * absolute expiresAt and the idle deadline (lastActivityAt + idle timeout) —
 * for the remaining-time countdown in the UI. Deliberately does NOT touch
 * lastActivityAt: unlike getSessionUser() above, this is called by the
 * client just to render a clock, and if displaying that clock itself counted
 * as activity, an open-but-idle tab would keep the session alive forever and
 * the idle timeout would never actually fire. Returns null when idle timeout
 * is disabled (nothing to count down to) or the session is gone/revoked.
 */
export async function peekSessionExpiry(token: string): Promise<Date | null> {
  const idleTimeoutMs = getSessionIdleTimeoutMs();
  if (!token || idleTimeoutMs === 0) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { expiresAt: true, lastActivityAt: true, revokedAt: true },
  });

  if (!session || session.revokedAt) {
    return null;
  }

  const idleExpiresAt = new Date(session.lastActivityAt.getTime() + idleTimeoutMs);
  return idleExpiresAt < session.expiresAt ? idleExpiresAt : session.expiresAt;
}

export async function revokeSession(token: string, reason: string = 'logout'): Promise<void> {
  if (!token) {
    return;
  }

  await prisma.session.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
}

/**
 * Read-only lookup of why this token's session was revoked, WITHOUT enforcing
 * validity (like getSessionOwner() above) — used only by GET /api/auth/session
 * to tell the client "a newer login elsewhere replaced this session"
 * (revokedReason === 'superseded') apart from every other way a session can
 * stop being valid (idle timeout, absolute expiry, explicit logout), which
 * the client either already handles precisely (idle timeout, via
 * sessionExpiresAt) or doesn't need to react to (logout is always
 * self-initiated).
 */
export async function getRevocationReason(token: string): Promise<string | null> {
  if (!token) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { revokedReason: true },
  });

  return session?.revokedReason ?? null;
}
