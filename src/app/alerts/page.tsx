import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { AlertManagement } from "@/components/AlertManagement";

export default async function AlertsPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "admin" && user.role !== "developer") redirect("/");

  return (
    <div className="container mx-auto p-6">
      <Suspense>
        <AlertManagement />
      </Suspense>
    </div>
  );
}
