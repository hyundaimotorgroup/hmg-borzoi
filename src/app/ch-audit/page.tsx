import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { ChAuditManagement } from "@/components/ChAuditManagement";

export default async function ChAuditPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");
  return <ChAuditManagement />;
}
