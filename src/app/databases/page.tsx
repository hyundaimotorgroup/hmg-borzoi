import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { DatabasesPage } from "@/components/DatabasesPage";

export default async function Databases() {
  const user = await getSession();
  if (!user) redirect("/login");
  return <DatabasesPage currentUser={user.id} />;
}
