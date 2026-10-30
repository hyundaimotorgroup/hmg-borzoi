import { isPrivateOrReservedHost } from '@/lib/validation/network';
import type { NotificationChannel } from './validation';

// Kept out of validation.ts (deliberately): that file also exports zod schemas
// consumed by client-side alert form validation, and isPrivateOrReservedHost
// transitively imports Node's `dns`/`net`, which broke the client bundle when
// it lived in the same module. Server-only API routes import this file directly.

/**
 * Rejects notification channel URLs (slack/webhook/teams) that resolve to a
 * private, loopback, link-local, or reserved (incl. cloud metadata) address.
 * Runs as a separate async step after schema parsing because `notificationChannelSchema`
 * is validated via zod's synchronous `safeParse` (see `parseRequestJson`), which
 * can't host an async `.refine()`.
 */
export async function assertNotificationChannelsHostsAllowed(
  channels: NotificationChannel[]
): Promise<void> {
  for (const channel of channels) {
    if (!channel.url) continue;

    let hostname: string;
    try {
      hostname = new URL(channel.url).hostname;
    } catch {
      throw new Error('Invalid notification channel URL');
    }

    if (await isPrivateOrReservedHost(hostname)) {
      throw new Error(
        'Notification channel URLs may not point to private, loopback, or reserved network addresses.'
      );
    }
  }
}
