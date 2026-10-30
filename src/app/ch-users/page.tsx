import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { UserManagement } from "@/components/UserManagement";

export default async function Users() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");
  return <UserManagement />;
}
