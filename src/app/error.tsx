"use client";

import { useEffect } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error("Page error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
      <h2 className="text-xl text-gray-900 dark:text-white mb-2">
        Something went wrong
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md">
        {error.message || "An unexpected error occurred. Please try again."}
      </p>
      {error.digest && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-6 font-mono">
          Error ID: {error.digest}
        </p>
      )}
      <Button
        onClick={reset}
        className="bg-gray-900 hover:bg-gray-800 text-white"
      >
        <RefreshCw className="w-4 h-4 mr-2" />
        Try again
      </Button>
    </div>
  );
}
