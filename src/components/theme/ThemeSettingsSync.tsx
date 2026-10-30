"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";
import { useSettings } from "@/contexts/SettingsContext";

export function ThemeSettingsSync() {
  const { displaySettings, hasLoadedStoredSettings } = useSettings();
  const { setTheme } = useTheme();

  useEffect(() => {
    // Overwriting next-themes with the default value ("system") before loading from localStorage causes screen flickering
    if (!hasLoadedStoredSettings) return;
    setTheme(displaySettings.theme);
  }, [displaySettings.theme, hasLoadedStoredSettings, setTheme]);

  return null;
}
