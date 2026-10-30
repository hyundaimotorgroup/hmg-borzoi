import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <SearchX className="w-12 h-12 text-gray-400 dark:text-gray-500 mb-4" />
      <h2 className="text-xl text-gray-900 dark:text-white mb-2">
        Page not found
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md">
        The page you are looking for does not exist or has been moved.
      </p>
      <Button asChild className="bg-gray-900 hover:bg-gray-800 text-white">
        <Link href="/">Go to Dashboard</Link>
      </Button>
    </div>
  );
}
