import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { AppAuditManagement } from "@/components/AppAuditManagement";

export default async function AppAuditPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");
  return <AppAuditManagement />;
}
