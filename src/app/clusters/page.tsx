import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { ClusterManagement } from "@/components/cluster-management/ClusterManagementPage";

export default async function ClustersPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");
  return <ClusterManagement currentUser={user.id} />;
}
