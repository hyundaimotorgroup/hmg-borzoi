"use client";

import { useState, useEffect } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Server,
  Terminal,
  Bell,
  Shield,
  Users,
  Settings,
  ChevronRight,
  ChevronLeft,
  Database,
  BarChart3,
  ChevronDown,
  LogOut,
  Boxes,
  AppWindow,
  ScrollText
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSelectedCluster } from "@/contexts/SelectedClusterContext";
import { useSidebar } from "@/contexts/SidebarContext";

export function SidebarNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, logout, canAccessManagement, canAccessAlerts, queryEditorEnabled } = useAuth();
  const { clearSelectedClusterId } = useSelectedCluster();
  const { isExpanded, expand: expandSidebar, collapse: collapseSidebar } = useSidebar();
  const [mounted, setMounted] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set());

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!loading && !user && pathname !== "/login") {
      router.push("/login");
    }
  }, [user, loading, pathname, router]);

  useEffect(() => {
    if (pathname.startsWith("/clusters") || pathname.startsWith("/ch-users") ||
        pathname.startsWith("/ch-stats") || pathname.startsWith("/ch-audit") ||
        pathname.startsWith("/ch-logs")) {
      setExpandedMenus(new Set(["management-clickhouse"]));
    } else if (pathname.startsWith("/app-users") || pathname.startsWith("/app-audit")) {
      setExpandedMenus(new Set(["management-app"]));
    }
  }, [pathname]);

  const navItems = [
    { id: "dashboard", href: "/", icon: LayoutDashboard, label: "Dashboard" },
    { id: "databases", href: "/databases", icon: Database, label: "Databases" },
    { id: "queries", href: "/queries", icon: Terminal, label: "Queries", requiresQueryEditor: true },
    { id: "alerts", href: "/alerts", icon: Bell, label: "Alerts", requiresAlertAccess: true },
    {
      id: "management-clickhouse", icon: Boxes, label: "ClickHouse Mgmt", adminOnly: true,
      subItems: [
        { id: "clusters", href: "/clusters", icon: Server, label: "Clusters" },
        { id: "ch-users", href: "/ch-users", icon: Users, label: "Users" },
        { id: "ch-stats", href: "/ch-stats", icon: BarChart3, label: "Statistics" },
        { id: "ch-audit", href: "/ch-audit", icon: Shield, label: "Audit" },
        { id: "ch-logs", href: "/ch-logs", icon: ScrollText, label: "Server Logs" },
      ],
    },
    {
      id: "management-app", icon: AppWindow, label: "App Mgmt", adminOnly: true,
      subItems: [
        { id: "app-users", href: "/app-users", icon: Users, label: "Users" },
        { id: "app-audit", href: "/app-audit", icon: Shield, label: "Audit" },
      ],
    },
    { id: "settings", href: "/settings", icon: Settings, label: "Settings" },
  ];

  const visibleNavItems = navItems.filter(item => {
    if (item.adminOnly && !canAccessManagement) return false;
    if (item.requiresAlertAccess && !canAccessAlerts) return false;
    if (item.requiresQueryEditor && !queryEditorEnabled) return false;
    return true;
  });

  const isActive = (href?: string) => {
    if (!href) return false;
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const toggleMenu = (id: string) => {
    const next = new Set(expandedMenus);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setExpandedMenus(next);
  };

  const handleMenuKeyDown = (e: ReactKeyboardEvent, id: string) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleMenu(id); }
  };

  const handleLogout = async () => {
    clearSelectedClusterId();
    localStorage.removeItem("sidebar-expanded");
    localStorage.removeItem("ch_monitor_settings");
    await logout();
  };

  if (pathname === "/login" || !user) return null;

  return (
    <div
      className={`ml-6 my-6 flex-shrink-0 ${mounted ? "transition-[width] duration-200 ease-in-out" : ""}`}
      style={{ width: mounted && isExpanded ? 280 : 92 }}
    >
      <div className={`h-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-3xl shadow-lg flex flex-col overflow-hidden ${mounted && isExpanded ? "p-4" : "p-4 items-center"}`}>

        {/* Project name and collapse control */}
        <div className={`mb-8 flex-shrink-0 h-14 ${mounted && isExpanded ? "flex items-center justify-between" : "flex items-center justify-center"}`}>
          {mounted && isExpanded ? (
            <>
              <p className="min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-white">
                hmg-borzoi
              </p>
              <button
                onClick={collapseSidebar}
                aria-label="Collapse sidebar"
                className="w-14 h-14 flex-shrink-0 rounded-2xl flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
              >
                <ChevronLeft className="w-6 h-6" aria-hidden="true" />
              </button>
            </>
          ) : (
            <button
              onClick={expandSidebar}
              aria-label="Expand sidebar"
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
              title="Expand"
            >
              <ChevronRight className="w-6 h-6" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* navigation */}
        <nav className={`flex-1 ${mounted && isExpanded ? "space-y-1" : "flex flex-col items-center gap-2"}`}>
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            if (!mounted || !isExpanded) {
              if (item.subItems) {
                return (
                  <button
                    key={item.id}
                    onClick={() => { expandSidebar(); toggleMenu(item.id); }}
                    aria-label={item.label}
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors
                      ${active ? "bg-gray-900 dark:bg-slate-600 text-white shadow-md" : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700"}`}
                    title={item.label}
                  >
                    <Icon className="w-6 h-6" aria-hidden="true" />
                  </button>
                );
              }
              return (
                <Link
                  key={item.id}
                  href={item.href || "/"}
                  aria-label={item.label}
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors
                    ${active ? "bg-gray-900 dark:bg-slate-600 text-white shadow-md" : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700"}`}
                  title={item.label}
                >
                  <Icon className="w-6 h-6" aria-hidden="true" />
                </Link>
              );
            }

            if (item.subItems) {
              const isMenuExpanded = expandedMenus.has(item.id);
              return (
                <div key={item.id}>
                  <button
                    onClick={() => toggleMenu(item.id)}
                    aria-label={`${item.label} menu`}
                    aria-expanded={isMenuExpanded}
                    onKeyDown={(e) => handleMenuKeyDown(e, item.id)}
                    className={`w-full h-14 flex items-center justify-between pr-3 rounded-2xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:focus-visible:ring-slate-400
                      ${active ? "bg-gray-900 dark:bg-slate-600 text-white" : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700"}`}
                  >
                    <div className="flex items-center min-w-0">
                      <span className="w-12 h-12 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-6 h-6" aria-hidden="true" />
                      </span>
                      <span className="text-sm ml-3 truncate">{item.label}</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 transition-transform ${isMenuExpanded ? "rotate-180" : ""}`} aria-hidden="true" />
                  </button>
                  {isMenuExpanded && (
                    <div className="mt-1 space-y-0.5">
                      {item.subItems.map((subItem) => {
                        const SubIcon = subItem.icon;
                        const subActive = isActive(subItem.href);
                        return (
                          <Link
                            key={subItem.id}
                            href={subItem.href || "/"}
                            className={`flex items-center h-10 pr-3 rounded-md transition-colors text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:focus-visible:ring-slate-400
                              ${subActive ? "bg-gray-100 dark:bg-slate-700 text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700/50 hover:text-gray-700 dark:hover:text-gray-200"}`}
                          >
                            <span className="w-12 h-10 flex items-center justify-center flex-shrink-0">
                              <SubIcon className="w-3.5 h-3.5" aria-hidden="true" />
                            </span>
                            <span className="ml-3 truncate">{subItem.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <Link
                key={item.id}
                href={item.href || "/"}
                className={`flex items-center h-14 pr-3 rounded-2xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:focus-visible:ring-slate-400
                  ${active ? "bg-gray-900 dark:bg-slate-600 text-white" : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700"}`}
              >
                <span className="w-12 h-12 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-6 h-6" aria-hidden="true" />
                </span>
                <span className="text-sm ml-3 truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* user + logout (expanded) */}
        {mounted && isExpanded && (
          <div className="pt-4 border-t border-gray-200 dark:border-slate-700 mt-4 space-y-2 flex-shrink-0">
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-sm flex-shrink-0">
                {user?.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 dark:text-white truncate">{user?.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{user?.role}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              <span className="text-sm">Logout</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
