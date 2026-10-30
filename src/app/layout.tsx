import { Suspense } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { SidebarNav } from "@/components/SidebarNav";
import { GlobalHeader } from "@/components/GlobalHeader";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ThemeSettingsSync } from "@/components/theme/ThemeSettingsSync";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { SelectedClusterProvider } from "@/contexts/SelectedClusterContext";
import { SidebarProvider } from "@/contexts/SidebarContext";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { ensureAlertSchedulerStarted } from "@/lib/alert/scheduler";
import "./globals.css";

export const metadata: Metadata = {
  title: "hmg-borzoi",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  ensureAlertSchedulerStarted("root-layout");
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="ko" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#f9fafb" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#0f172a" media="(prefers-color-scheme: dark)" />
      </head>
      <body className="antialiased bg-gray-50 dark:bg-slate-900 [color-scheme:light] dark:[color-scheme:dark]" suppressHydrationWarning>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-gray-900 focus:text-white focus:rounded-lg focus:text-sm focus:font-medium"
        >
          Skip to main content
        </a>
        <AuthProvider>
          <ThemeProvider nonce={nonce}>
            <SettingsProvider>
              <ThemeSettingsSync />
              <SelectedClusterProvider>
                <SidebarProvider>
                  <div className="flex h-screen bg-gray-50 dark:bg-slate-900">
                    <SidebarNav />
                    <div className="flex-1 flex flex-col overflow-hidden">
                      <GlobalHeader />
                      <main id="main-content" className="flex-1 overflow-auto bg-gray-50 dark:bg-slate-900">
                        <Suspense fallback={<PageSkeleton />}>
                          {children}
                        </Suspense>
                      </main>
                    </div>
                  </div>
                </SidebarProvider>
              </SelectedClusterProvider>
            </SettingsProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
