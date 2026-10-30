import { useState, useEffect, useCallback } from "react";
import { logger } from "@/lib/utils/logger";
import { buildPlatformUsers } from "../types";
import type { ApiUser, PlatformUser } from "../types";

export function usePlatformUsers() {
  const [platformUsers, setPlatformUsers] = useState<PlatformUser[]>([]);

  const reloadUsers = useCallback(async (signal?: AbortSignal) => {
    const usersRes = await fetch('/api/app-users', { signal });
    if (usersRes.ok) {
      const data: ApiUser[] = await usersRes.json();
      setPlatformUsers(buildPlatformUsers(data));
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    reloadUsers(controller.signal).catch((err) => {
      if (err instanceof Error && err.name === 'AbortError') return;
      logger.error('[SecurityManagement] Error fetching app users:', err);
    });
    return () => controller.abort();
  }, [reloadUsers]);

  return { platformUsers, setPlatformUsers, reloadUsers };
}
