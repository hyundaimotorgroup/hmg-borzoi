"use client";

import { useRouter } from "next/navigation";
import { ClusterDetail } from "@/components/ClusterDetail";

interface ClusterPageClientProps {
  clusterId: string;
  userId: string;
}

export function ClusterPageClient({ clusterId, userId }: ClusterPageClientProps) {
  const router = useRouter();
  return (
    <ClusterDetail
      clusterId={clusterId}
      onBack={() => router.push("/")}
      currentUser={userId}
    />
  );
}
