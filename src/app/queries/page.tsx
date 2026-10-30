import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { isQueryEditorEnabled } from "@/lib/feature-flags";
import { QueriesPage } from "@/components/QueriesPage";

export default async function Queries() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!isQueryEditorEnabled()) redirect("/");
  return <QueriesPage currentUser={user.id} />;
}
