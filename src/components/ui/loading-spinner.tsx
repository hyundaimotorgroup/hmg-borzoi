import { Loader2 } from "lucide-react";

interface PanelLoaderProps {
  label?: string;
  className?: string;
}

export function PanelLoader({ label, className = "py-8" }: PanelLoaderProps) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      {label && (
        <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">{label}</span>
      )}
    </div>
  );
}
