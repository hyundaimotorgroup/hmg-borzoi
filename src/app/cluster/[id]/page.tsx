import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { ClusterPageClient } from "./ClusterPageClient";

export default async function ClusterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSession();
  if (!user) redirect("/login");
  return <ClusterPageClient clusterId={id} userId={user.id} />;
}
