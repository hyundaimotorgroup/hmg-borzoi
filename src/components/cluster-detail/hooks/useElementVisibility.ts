import { useEffect, useState, type RefObject } from "react";

interface UseElementVisibilityOptions {
  root?: Element | null;
  rootMargin?: string;
  threshold?: number | number[];
  requireDocumentVisible?: boolean;
}

export function useElementVisibility<T extends Element>(
  ref: RefObject<T | null>,
  {
    root = null,
    rootMargin = "0px",
    threshold = 0,
    requireDocumentVisible = true,
  }: UseElementVisibilityOptions = {}
) {
  const [isVisible, setIsVisible] = useState(false);
  const [isDocumentVisible, setIsDocumentVisible] = useState(
    typeof document === "undefined" ? true : document.visibilityState !== "hidden"
  );

  useEffect(() => {
    if (!requireDocumentVisible || typeof document === "undefined") {
      return;
    }

    const handleVisibilityChange = () => {
      setIsDocumentVisible(document.visibilityState !== "hidden");
    };

    handleVisibilityChange();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [requireDocumentVisible]);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { root, rootMargin, threshold }
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [ref, root, rootMargin, threshold]);

  return requireDocumentVisible ? isVisible && isDocumentVisible : isVisible;
}

export function useDeferredVisibleValue<T>(value: T, isVisible: boolean) {
  const [visibleValue, setVisibleValue] = useState(value);

  useEffect(() => {
    if (isVisible) {
      setVisibleValue(value);
    }
  }, [isVisible, value]);

  return visibleValue;
}
