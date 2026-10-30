import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { SettingsPage } from "@/components/SettingsPage";

export default async function Settings() {
  const user = await getSession();
  if (!user) redirect("/login");
  return <SettingsPage />;
}
