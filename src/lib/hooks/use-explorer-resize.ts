import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";

const MIN_WIDTH = 200;
const MAX_WIDTH = 600;
const CONTENT_MIN_WIDTH = 400;
const RESIZE_GUTTER = 24;

interface DragSession {
  element: HTMLDivElement;
  pointerId: number;
  startX: number;
  startWidth: number;
  preferredWidth: number;
  width: number;
  selectionStyles: { property: string; value: string; priority: string }[];
}

export function useExplorerResize(active: boolean, storageKey?: string) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragSession | null>(null);
  const [preferredWidth, setPreferredWidth] = useState(MIN_WIDTH);
  const [containerWidth, setContainerWidth] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const maxWidth = containerWidth === null
    ? MAX_WIDTH
    : Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.floor(containerWidth - RESIZE_GUTTER - CONTENT_MIN_WIDTH)));
  const width = Math.min(preferredWidth, maxWidth);

  useEffect(() => {
    let restoredWidth = MIN_WIDTH;
    if (storageKey) {
      try {
        const stored = window.localStorage.getItem(storageKey);
        const parsed = stored !== null && /^\d+$/.test(stored) ? Number(stored) : NaN;
        if (Number.isInteger(parsed) && parsed >= MIN_WIDTH && parsed <= MAX_WIDTH) {
          restoredWidth = parsed;
        }
      } catch {
        // Resizing remains available when browser storage is disabled.
      }
    }
    setPreferredWidth(restoredWidth);
  }, [storageKey]);

  const saveWidth = useCallback((nextWidth: number) => {
    if (!storageKey) return;
    try {
      window.localStorage.setItem(storageKey, String(nextWidth));
    } catch {
      // Keep the current width even when persisting the preference fails.
    }
  }, [storageKey]);

  const finishDrag = useCallback((commit: boolean) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    for (const { property, value, priority } of drag.selectionStyles) {
      if (value) document.body.style.setProperty(property, value, priority);
      else document.body.style.removeProperty(property);
    }
    if (drag.element.hasPointerCapture(drag.pointerId)) {
      drag.element.releasePointerCapture(drag.pointerId);
    }
    setIsDragging(false);
    const changed = commit && drag.width !== drag.startWidth;
    setPreferredWidth(changed ? drag.width : drag.preferredWidth);
    if (changed) saveWidth(drag.width);
  }, [saveWidth]);

  useLayoutEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;
    const measure = () => setContainerWidth(container.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [active]);

  useEffect(() => () => finishDrag(false), [active, finishDrag]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!active || !event.isPrimary || event.button !== 0 || dragRef.current) return;
    event.preventDefault();
    const element = event.currentTarget;
    element.focus();
    element.setPointerCapture(event.pointerId);
    const selectionStyles = ["user-select", "-webkit-user-select"].map((property) => ({
      property,
      value: document.body.style.getPropertyValue(property),
      priority: document.body.style.getPropertyPriority(property),
    }));
    dragRef.current = {
      element,
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: width,
      preferredWidth,
      width,
      selectionStyles,
    };
    for (const { property } of selectionStyles) {
      document.body.style.setProperty(property, "none", "important");
    }
    setIsDragging(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const nextWidth = Math.round(Math.max(MIN_WIDTH, Math.min(maxWidth, drag.startWidth + event.clientX - drag.startX)));
    drag.width = nextWidth;
    setPreferredWidth(nextWidth);
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    onPointerMove(event);
    finishDrag(true);
  };

  const onPointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) finishDrag(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && dragRef.current) {
      event.preventDefault();
      finishDrag(false);
      return;
    }
    if (!active || dragRef.current) return;
    let nextWidth: number;
    switch (event.key) {
      case "ArrowLeft": nextWidth = width - 16; break;
      case "ArrowRight": nextWidth = width + 16; break;
      case "Home": nextWidth = MIN_WIDTH; break;
      case "End": nextWidth = maxWidth; break;
      default: return;
    }
    event.preventDefault();
    nextWidth = Math.max(MIN_WIDTH, Math.min(maxWidth, nextWidth));
    if (nextWidth === width) return;
    setPreferredWidth(nextWidth);
    saveWidth(nextWidth);
  };

  return {
    containerRef,
    width,
    minWidth: MIN_WIDTH,
    maxWidth,
    isDragging,
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onLostPointerCapture: onPointerCancel,
      onKeyDown,
    },
  };
}
