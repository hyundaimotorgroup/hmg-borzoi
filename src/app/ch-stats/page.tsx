import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { UserStatistics } from "@/components/UserStatistics";

export default async function Stats() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");
  return <UserStatistics />;
}
