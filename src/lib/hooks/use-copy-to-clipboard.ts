import { useState, useRef, useEffect } from "react";
import { writeTextSafe } from "@/lib/utils/clipboard";

export function useCopyToClipboard(resetDelay = 2000) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const copy = async (text: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const success = await writeTextSafe(text);
    if (success) {
      setCopied(true);
      setFailed(false);
      timerRef.current = setTimeout(() => setCopied(false), resetDelay);
    } else {
      setFailed(true);
      setCopied(false);
      timerRef.current = setTimeout(() => setFailed(false), resetDelay);
    }
  };

  return { copied, failed, copy };
}
