import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { DashboardOverview } from "@/components/DashboardOverview";

export default async function HomePage() {
  const user = await getSession();
  if (!user) redirect("/login");
  return <DashboardOverview currentUser={user.id} />;
}
