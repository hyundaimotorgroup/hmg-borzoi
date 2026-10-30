"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

const STORAGE_KEY = "selectedClusterId";

interface SelectedClusterContextValue {
  selectedClusterId: string;
  setSelectedClusterId: (id: string) => void;
  clearSelectedClusterId: () => void;
}

const SelectedClusterContext = createContext<SelectedClusterContextValue>({
  selectedClusterId: "",
  setSelectedClusterId: () => {},
  clearSelectedClusterId: () => {},
});

export function SelectedClusterProvider({ children }: { children: ReactNode }) {
  const [selectedClusterId, setSelectedClusterIdState] = useState<string>("");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) setSelectedClusterIdState(stored);
  }, []);

  const setSelectedClusterId = (id: string) => {
    setSelectedClusterIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  const clearSelectedClusterId = () => {
    setSelectedClusterIdState("");
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <SelectedClusterContext.Provider value={{ selectedClusterId, setSelectedClusterId, clearSelectedClusterId }}>
      {children}
    </SelectedClusterContext.Provider>
  );
}

export function useSelectedCluster() {
  return useContext(SelectedClusterContext);
}
