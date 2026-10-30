"use client";

import { useCallback, useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/contexts/SettingsContext";

export function ThemeToggle() {
  const { resolvedTheme } = useTheme();
  const { updateDisplaySettings } = useSettings();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Since ThemeSettingsSync detects changes to displaySettings.theme and propagates them to next-themes,
  // calling setTheme directly here would cause the two states to race, which may cause the theme to flicker.
  const toggleTheme = useCallback(() => {
    const nextTheme: "light" | "dark" = resolvedTheme === "dark" ? "light" : "dark";
    updateDisplaySettings({ theme: nextTheme });
  }, [resolvedTheme, updateDisplaySettings]);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label="Toggle theme"
      className="hover:bg-gray-100 dark:hover:bg-slate-700"
    >
      {/* During SSR, resolvedTheme is undefined, so we render a fixed icon until mounted to prevent hydration mismatch */}
      {mounted && resolvedTheme === "dark" ? (
        <Sun className="w-4 h-4 text-gray-600 dark:text-gray-300" aria-hidden="true" />
      ) : (
        <Moon className="w-4 h-4 text-gray-600 dark:text-gray-300" aria-hidden="true" />
      )}
    </Button>
  );
}
