"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const SHOW_DELAY_MS = 180;
const HIDE_DELAY_MS = 700;

interface ChartLoadingBarProps {
  loading: boolean;
  className?: string;
  showDelayMs?: number;
  hideDelayMs?: number;
  onVisibilityChange?: (visible: boolean) => void;
}

interface LoadingBarVisibilityOptions {
  showDelayMs?: number;
  hideDelayMs?: number;
}

export function useLoadingBarVisibility(
  loading: boolean,
  { showDelayMs = SHOW_DELAY_MS, hideDelayMs = HIDE_DELAY_MS }: LoadingBarVisibilityOptions = {}
) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    if (loading) {
      if (!visible) {
        if (showDelayMs <= 0) {
          setVisible(true);
        } else {
          timeoutId = setTimeout(() => {
            setVisible(true);
          }, showDelayMs);
        }
      }
    } else if (visible) {
      timeoutId = setTimeout(() => {
        setVisible(false);
      }, hideDelayMs);
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [hideDelayMs, loading, showDelayMs, visible]);

  return visible;
}

export function ChartLoadingBar({
  loading,
  className,
  showDelayMs = SHOW_DELAY_MS,
  hideDelayMs = HIDE_DELAY_MS,
  onVisibilityChange,
}: ChartLoadingBarProps) {
  const visible = useLoadingBarVisibility(loading, { showDelayMs, hideDelayMs });

  useEffect(() => {
    onVisibilityChange?.(visible);
  }, [onVisibilityChange, visible]);

  if (!visible) {
    return null;
  }

  return (
    <div
      className={cn("pointer-events-none absolute z-30 overflow-hidden rounded-t-[inherit]", className)}
      style={{ top: 0, left: 0, right: 0, height: 4, background: "rgba(148, 163, 184, 0.35)" }}
    >
      <div
        className="chart-loading-bar"
        style={{
          width: "100%",
          height: "100%",
          backgroundImage:
            "linear-gradient(90deg, rgba(37,99,235,0.08) 0%, rgba(37,99,235,0.98) 24%, rgba(6,182,212,0.98) 50%, rgba(37,99,235,0.98) 76%, rgba(37,99,235,0.08) 100%)",
          backgroundSize: "220% 100%",
          boxShadow: "0 0 14px rgba(37,99,235,0.45)",
        }}
      />
    </div>
  );
}

export function useLoadingBarVisibilityState(loading: boolean) {
  const isLoadingBarVisible = useLoadingBarVisibility(loading, { showDelayMs: 0, hideDelayMs: HIDE_DELAY_MS });

  return {
    showLoadingState: loading || isLoadingBarVisible,
    handleLoadingBarVisibilityChange: () => {},
  };
}
