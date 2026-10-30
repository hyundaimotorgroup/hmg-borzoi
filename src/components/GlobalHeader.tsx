"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { logger } from "@/lib/utils/logger";
import { Bell, Clock, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatTimeWithTimezone } from "@/lib/utils/time-formatter";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { formatDistanceToNow, subHours } from "date-fns";
import { ko } from "date-fns/locale";

interface GlobalHeaderProps {
  onAlertClick?: (alertId: string) => void;
}

interface AlertNotification {
  id: string;
  ruleName: string;
  severity: string;
  triggered: boolean;
  queryResult: number | null;
  executedAt: string;
  error: string | null;
}

interface ExecutionLogApiItem {
  id: string;
  ruleName: string | null;
  severity: string | null;
  triggered: boolean;
  queryResult: number | null;
  executedAt: string;
  error: string | null;
}

const PAGE_META: Array<{ prefix: string; title: string; subtitle: string }> = [
  { prefix: "/databases",  title: "Table Explorer",              subtitle: "Explore databases and tables across clusters" },
  { prefix: "/queries",    title: "Query Editor",                subtitle: "Execute SQL queries on your CH clusters" },
  { prefix: "/alerts",     title: "Alert Management",            subtitle: "Configure and monitor alert rules" },
  { prefix: "/clusters",   title: "Clusters",                    subtitle: "Manage your ClickHouse cluster connections" },
  { prefix: "/ch-users",   title: "User Management",             subtitle: "Manage ClickHouse database users" },
  { prefix: "/ch-stats",   title: "User Statistics",             subtitle: "Analyze query performance by user" },
  { prefix: "/ch-audit",   title: "Audit Logs",                  subtitle: "ClickHouse query and DDL audit trail" },
  { prefix: "/ch-logs",    title: "Server Logs",                 subtitle: "View ClickHouse server log entries" },
  { prefix: "/app-users",  title: "App Users",                   subtitle: "Manage application user accounts" },
  { prefix: "/app-audit",  title: "App Audit",                   subtitle: "Application access audit trail" },
  { prefix: "/settings",   title: "Settings",                    subtitle: "Configure application preferences" },
  { prefix: "/",           title: "Dashboard Overview",          subtitle: "Monitor all your CH clusters in one place" },
];

function getPageMeta(pathname: string) {
  for (const entry of PAGE_META) {
    if (entry.prefix === "/" ? pathname === "/" : pathname.startsWith(entry.prefix)) {
      return entry;
    }
  }
  return PAGE_META[PAGE_META.length - 1];
}

const SESSION_WARNING_THRESHOLD_MS = 60_000;

function formatRemaining(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function GlobalHeader({ onAlertClick: _onAlertClick }: GlobalHeaderProps) {
  const pathname = usePathname();
  const { generalSettings } = useSettings();
  const { sessionExpiresAt } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [notifications, setNotifications] = useState<AlertNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!sessionExpiresAt) {
      setRemainingMs(null);
      return;
    }

    const tick = () => setRemainingMs(Math.max(0, sessionExpiresAt.getTime() - Date.now()));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [sessionExpiresAt]);

  useEffect(() => {
    const fetchNotifications = async () => {
      if (document.hidden) return;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      try {
        const from = subHours(new Date(), 24).toISOString();
        const response = await fetch(`/api/execution-logs?limit=10&from=${from}`, { signal: controller.signal });

        if (response.ok) {
          const data = await response.json();
          const alertNotifications: AlertNotification[] = (data.data as ExecutionLogApiItem[])
            .filter((log) => log.triggered)
            .map((log) => ({
              id: log.id,
              ruleName: log.ruleName || 'Unknown Alert',
              severity: log.severity || 'warning',
              triggered: log.triggered,
              queryResult: log.queryResult,
              executedAt: log.executedAt,
              error: log.error,
            }));

          setNotifications(alertNotifications);
          setUnreadCount(alertNotifications.length);
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        logger.error('Failed to fetch notifications:', error);
      }
    };

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => { clearInterval(interval); controllerRef.current?.abort(); };
  }, []);

  useEffect(() => {
    setCurrentTime(new Date());
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const cacheTTL = parseInt(generalSettings.cacheTTL || "60");
    const updateServerTTL = async () => {
      try {
        await fetch('/api/cache/configure', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ttl: cacheTTL }),
        });
      } catch (error) {
        logger.error('Failed to update cache TTL:', error);
      }
    };
    updateServerTTL();
  }, [generalSettings.cacheTTL]);

  const timezone = generalSettings.timezone || 'UTC';
  const { title, subtitle } = getPageMeta(pathname);

  if (pathname === "/login") return null;

  return (
    <header style={{ height: 100, paddingTop: 28 }} className="bg-gray-50 dark:bg-slate-900 flex items-start justify-between px-6 gap-4 flex-shrink-0">
      {/* page title + subtitle */}
      <div className="flex flex-col justify-center min-w-0">
        <span style={{ fontSize: 26, fontWeight: 600 }} className="tracking-wide text-gray-900 dark:text-white leading-snug truncate">
          {title}
        </span>
        <span style={{ fontSize: 13 }} className="tracking-wide text-gray-500 dark:text-gray-400 leading-snug truncate">
          {subtitle}
        </span>
      </div>

      {/* Right: time, theme, notifications */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {remainingMs !== null && (
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
              remainingMs < SESSION_WARNING_THRESHOLD_MS
                ? "bg-red-100 dark:bg-red-900/30"
                : "bg-gray-100 dark:bg-slate-800"
            }`}
            title="유휴 시간 초과 시 자동 로그아웃까지 남은 시간"
          >
            <Timer
              className={`w-4 h-4 ${
                remainingMs < SESSION_WARNING_THRESHOLD_MS
                  ? "text-red-600 dark:text-red-400"
                  : "text-gray-600 dark:text-gray-400"
              }`}
              aria-hidden="true"
            />
            <span
              className={`text-sm ${
                remainingMs < SESSION_WARNING_THRESHOLD_MS
                  ? "text-red-700 dark:text-red-400"
                  : "text-gray-700 dark:text-gray-300"
              }`}
            >
              {formatRemaining(remainingMs)}
            </span>
          </div>
        )}

        {currentTime && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-slate-800 rounded-lg">
            <Clock className="w-4 h-4 text-gray-600 dark:text-gray-400" aria-hidden="true" />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {formatTimeWithTimezone(currentTime, timezone)}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-500">
              {timezone}
            </span>
          </div>
        )}

        <ThemeToggle />

        {mounted ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Notifications"
                className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors relative"
              >
                <Bell className="w-4 h-4 text-gray-600 dark:text-gray-300" aria-hidden="true" />
                {unreadCount > 0 && (
                  <>
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  </>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <div className="p-3 border-b dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm">Notifications</h3>
                  {unreadCount > 0 && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {unreadCount} new
                    </span>
                  )}
                </div>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center">
                    <Bell className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" aria-hidden="true" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">No alerts</p>
                  </div>
                ) : (
                  notifications.map((notification) => {
                    const timeAgo = formatDistanceToNow(new Date(notification.executedAt), { addSuffix: true, locale: ko });
                    const severityColor = notification.error
                      ? 'bg-red-500'
                      : notification.severity === 'critical'
                      ? 'bg-red-500'
                      : notification.severity === 'warning'
                      ? 'bg-orange-500'
                      : 'bg-blue-500';

                    return (
                      <DropdownMenuItem
                        key={notification.id}
                        asChild
                        className="flex flex-col items-start p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800"
                      >
                        <Link href="/alerts?tab=history">
                          <div className="flex items-start gap-2 w-full">
                            <div className={`w-2 h-2 ${severityColor} rounded-full mt-1.5 flex-shrink-0`}></div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm truncate">{notification.ruleName}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                {notification.error ? (
                                  <span className="text-red-600 dark:text-red-400">
                                    Error: {notification.error}
                                  </span>
                                ) : (
                                  <>Alert triggered (value: {notification.queryResult !== null ? notification.queryResult : 'N/A'})</>
                                )}
                              </p>
                              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{timeAgo}</p>
                            </div>
                          </div>
                        </Link>
                      </DropdownMenuItem>
                    );
                  })
                )}
              </div>
              <div className="p-2 border-t dark:border-slate-700">
                <Button variant="ghost" className="w-full text-xs" size="sm" asChild>
                  <Link href="/alerts">View All Notifications</Link>
                </Button>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <button
            aria-label="Notifications"
            className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors relative"
            type="button"
            disabled
          >
            <Bell className="w-4 h-4 text-gray-600 dark:text-gray-300" aria-hidden="true" />
          </button>
        )}
      </div>
    </header>
  );
}
