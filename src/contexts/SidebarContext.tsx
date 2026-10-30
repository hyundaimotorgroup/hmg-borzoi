"use client";

import { createContext, useContext, useState, useEffect } from "react";

interface SidebarContextValue {
  isExpanded: boolean;
  toggle: () => void;
  expand: () => void;
  collapse: () => void;
}

const SidebarContext = createContext<SidebarContextValue>({
  isExpanded: true,
  toggle: () => {},
  expand: () => {},
  collapse: () => {},
});

const STORAGE_KEY = "sidebar-expanded";

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) setIsExpanded(saved === "true");
  }, []);

  const set = (value: boolean) => {
    setIsExpanded(value);
    localStorage.setItem(STORAGE_KEY, String(value));
  };

  return (
    <SidebarContext.Provider
      value={{
        isExpanded,
        toggle: () => set(!isExpanded),
        expand: () => set(true),
        collapse: () => set(false),
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export const useSidebar = () => useContext(SidebarContext);
