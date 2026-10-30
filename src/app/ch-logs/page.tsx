import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { ChLogManagement } from "@/components/ChLogManagement";

export default async function ChLogPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");
  return <ChLogManagement />;
}
