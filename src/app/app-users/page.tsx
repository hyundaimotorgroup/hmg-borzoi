import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { SecurityManagement } from "@/components/security/SecurityManagementPage";

export default async function SecurityPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");
  return <SecurityManagement />;
}
