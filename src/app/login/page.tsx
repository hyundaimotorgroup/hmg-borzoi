import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { isSsoEnabled } from "@/lib/feature-flags";
import { loginErrorMessage } from "@/lib/auth/login-error-messages";
import { LoginForm } from "@/components/auth/LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; returnTo?: string }>;
}) {
  const user = await getSession();
  if (user) redirect("/");

  const { error, returnTo } = await searchParams;

  return (
    <LoginForm
      ssoEnabled={isSsoEnabled()}
      initialError={error ? loginErrorMessage(error) : undefined}
      returnTo={returnTo}
    />
  );
}
