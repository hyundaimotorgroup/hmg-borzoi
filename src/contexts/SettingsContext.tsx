"use client";

import { createContext, useContext, useState, ReactNode, useEffect, useCallback, useMemo } from "react";

interface GeneralSettings {
  appName: string;
  defaultCluster: string;
  refreshInterval: string;
  cacheTTL: string; // cache TTL (seconds)
  timezone: string;
  language: string;
}

interface DisplaySettings {
  theme: "light" | "dark" | "system";
  compactMode: boolean;
  showGridLines: boolean;
  defaultChartType: string;
}

interface SecuritySettings {
  sessionTimeout: string;
  requireMFA: boolean;
  passwordExpiry: string;
  maxLoginAttempts: string;
  enableIPWhitelist: boolean;
  enableAuditLog: boolean;
}

interface RetentionSettings {
  queryHistoryDays: string;
  alertHistoryDays: string;
  metricRetentionDays: string;
}

interface SettingsContextType {
  generalSettings: GeneralSettings;
  displaySettings: DisplaySettings;
  securitySettings: SecuritySettings;
  retentionSettings: RetentionSettings;
  hasLoadedStoredSettings: boolean;
  updateGeneralSettings: (settings: Partial<GeneralSettings>) => void;
  updateDisplaySettings: (settings: Partial<DisplaySettings>) => void;
  updateSecuritySettings: (settings: Partial<SecuritySettings>) => void;
  updateRetentionSettings: (settings: Partial<RetentionSettings>) => void;
  saveAllSettings: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const STORAGE_KEY = "ch_monitor_settings";

const defaultGeneralSettings: GeneralSettings = {
  appName: "hmg-borzoi",
  defaultCluster: "ckc01",
  refreshInterval: "60", // 1 minute - standard for monitoring tools
  cacheTTL: "60", // 60 seconds - should be ≤ refreshInterval
  timezone: "UTC",
  language: "en"
};

const defaultDisplaySettings: DisplaySettings = {
  theme: "system",
  compactMode: false,
  showGridLines: true,
  defaultChartType: "line"
};

function normalizeThemePreference(theme: unknown): DisplaySettings["theme"] {
  if (theme === "light" || theme === "dark" || theme === "system") {
    return theme;
  }
  if (theme === "auto") {
    return "system";
  }
  return defaultDisplaySettings.theme;
}

const defaultSecuritySettings: SecuritySettings = {
  sessionTimeout: "60",
  requireMFA: false,
  passwordExpiry: "90",
  maxLoginAttempts: "5",
  enableIPWhitelist: false,
  enableAuditLog: false
};

const defaultRetentionSettings: RetentionSettings = {
  queryHistoryDays: "30",
  alertHistoryDays: "90",
  metricRetentionDays: "365"
};

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [generalSettings, setGeneralSettings] = useState<GeneralSettings>(
    defaultGeneralSettings
  );
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(
    defaultDisplaySettings
  );
  const [securitySettings, setSecuritySettings] = useState<SecuritySettings>(
    defaultSecuritySettings
  );
  const [retentionSettings, setRetentionSettings] = useState<RetentionSettings>(
    defaultRetentionSettings
  );
  const [hasLoadedStoredSettings, setHasLoadedStoredSettings] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const stored = JSON.parse(raw);
        if (stored?.general) {
          setGeneralSettings({ ...defaultGeneralSettings, ...stored.general });
        }
        if (stored?.display) {
          setDisplaySettings({
            ...defaultDisplaySettings,
            ...stored.display,
            theme: normalizeThemePreference(stored.display.theme),
          });
        }
        if (stored?.security) {
          setSecuritySettings(stored.security);
        }
        if (stored?.retention) {
          setRetentionSettings(stored.retention);
        }
      }
    } catch {
      // Ignore invalid persisted settings and continue with defaults.
    } finally {
      setHasLoadedStoredSettings(true);
    }
  }, []);


  // Save all settings to localStorage
  const saveAllSettings = useCallback(() => {
    if (typeof window === 'undefined') return; // Do not run on the server

    try {
      const allSettings = {
        general: generalSettings,
        display: displaySettings,
        security: securitySettings,
        retention: retentionSettings,
        lastUpdated: new Date().toISOString()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(allSettings));
    } catch (_error) {
      // Failed to save settings
    }
  }, [generalSettings, displaySettings, securitySettings, retentionSettings]);

  // Auto-save when settings change (debounced)
  useEffect(() => {
    if (!hasLoadedStoredSettings) return;

    const timer = setTimeout(() => {
      saveAllSettings();
    }, 500); // Debounce 500ms

    return () => clearTimeout(timer);
  }, [hasLoadedStoredSettings, saveAllSettings]);

  // Apply compact mode (client-side only)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const root = document.documentElement;
    if (displaySettings.compactMode) {
      root.style.setProperty("--spacing-scale", "0.8");
    } else {
      root.style.setProperty("--spacing-scale", "1");
    }
  }, [displaySettings.compactMode]);

  const updateGeneralSettings = useCallback((settings: Partial<GeneralSettings>) => {
    setGeneralSettings((prev) => ({ ...prev, ...settings }));
  }, []);

  const updateDisplaySettings = useCallback((settings: Partial<DisplaySettings>) => {
    setDisplaySettings((prev) => ({ ...prev, ...settings }));
  }, []);

  const updateSecuritySettings = useCallback((settings: Partial<SecuritySettings>) => {
    setSecuritySettings((prev) => ({ ...prev, ...settings }));
  }, []);

  const updateRetentionSettings = useCallback((settings: Partial<RetentionSettings>) => {
    setRetentionSettings((prev) => ({ ...prev, ...settings }));
  }, []);

  const contextValue = useMemo(() => ({
    generalSettings,
    displaySettings,
    securitySettings,
    retentionSettings,
    hasLoadedStoredSettings,
    updateGeneralSettings,
    updateDisplaySettings,
    updateSecuritySettings,
    updateRetentionSettings,
    saveAllSettings,
  }), [
    generalSettings,
    displaySettings,
    securitySettings,
    retentionSettings,
    hasLoadedStoredSettings,
    updateGeneralSettings,
    updateDisplaySettings,
    updateSecuritySettings,
    updateRetentionSettings,
    saveAllSettings,
  ]);

  return (
    <SettingsContext.Provider value={contextValue}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}
