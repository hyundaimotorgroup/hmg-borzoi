"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { AlertCircle } from "lucide-react";
import { loginSchema, type LoginInput } from "@/lib/validation";
import { POST_LOGOUT_MESSAGE_KEY, loginErrorMessage } from "@/lib/auth/login-error-messages";

interface LoginFormProps {
  ssoEnabled?: boolean;
  initialError?: string;
  returnTo?: string;
}

export function LoginForm({ ssoEnabled = false, initialError, returnTo }: LoginFormProps) {
  const [loginError, setLoginError] = useState(initialError || "");
  const [signupOpen, setSignupOpen] = useState(false);

  const { login, register } = useAuth();
  const router = useRouter();

  const loginForm = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  // No redirect-if-already-logged-in effect here: the server component
  // (login/page.tsx) already checks getSession() and redirects before this
  // renders. Doing it again here off AuthContext's client-side `user` state
  // is redundant and dangerous — that state is only refreshed on first mount
  // (see AuthContext's checkSession effect), so once this session is revoked
  // elsewhere it goes stale-truthy and this would push("/") straight into the
  // server's redirect("/login"), forming an infinite loop.

  // Picks up a message stashed before an SSO logout redirect (see
  // AuthContext.tsx's logout()) — that round trip through the IdP can only
  // use a fixed, pre-registered post_logout_redirect_uri with no query
  // string, so the reason (e.g. "idle_timeout") travels via sessionStorage
  // instead of the URL.
  useEffect(() => {
    const pending = sessionStorage.getItem(POST_LOGOUT_MESSAGE_KEY);
    if (!pending) {
      return;
    }
    sessionStorage.removeItem(POST_LOGOUT_MESSAGE_KEY);
    const code = new URLSearchParams(pending).get("error");
    if (code) {
      setLoginError(loginErrorMessage(code));
    }
  }, []);

  const handleLogin = async (values: LoginInput) => {
    setLoginError("");
    const result = await login(values.email, values.password);
    if (result.success) {
      router.push("/");
    } else {
      setLoginError(result.error || "Login failed. Please try again.");
    }
  };

  const ssoStartUrl = returnTo
    ? `/api/auth/oidc/start?returnTo=${encodeURIComponent(returnTo)}`
    : "/api/auth/oidc/start";

  return (
    <>
      <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-900 dark:to-slate-800 p-4">
        <Card className="w-full max-w-md shadow-2xl">
          <CardHeader className="text-center">
            <div>
              <CardTitle className="text-2xl text-gray-900 dark:text-white">hmg-borzoi</CardTitle>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">Sign in with your account</p>
            </div>
          </CardHeader>
          <CardContent>
            <div aria-live="polite" aria-atomic="true">
              {loginError && (
                <div className="flex items-center gap-2 p-3 mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" aria-hidden="true" />
                  <p className="text-sm text-red-600 dark:text-red-400">{loginError}</p>
                </div>
              )}
            </div>

            {ssoEnabled ? (
              <Button
                asChild
                className="w-full bg-gray-900 text-white hover:bg-gray-700 py-3 px-4 rounded-lg transition-[background-color,box-shadow] shadow-md hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 dark:bg-slate-100 dark:text-gray-900 dark:hover:bg-white dark:focus-visible:ring-slate-400"
              >
                <a href={ssoStartUrl}>SSO로 로그인</a>
              </Button>
            ) : (
              <Form {...loginForm}>
                <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
                  <FormField
                    control={loginForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input {...field} id="login-email" type="email" placeholder="you@example.com" autoComplete="email" spellCheck={false} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={loginForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input {...field} id="login-password" type="password" placeholder="••••••••" autoComplete="current-password" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    disabled={loginForm.formState.isSubmitting}
                    className="w-full bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-70 disabled:cursor-not-allowed py-3 px-4 rounded-lg transition-[background-color,box-shadow] shadow-md hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 dark:bg-slate-100 dark:text-gray-900 dark:hover:bg-white dark:focus-visible:ring-slate-400"
                  >
                    {loginForm.formState.isSubmitting ? "Signing in…" : "Sign In"}
                  </Button>

                  <p className="text-center text-sm text-gray-500 dark:text-gray-400">
                    Don&apos;t have an account?{" "}
                    <button
                      type="button"
                      onClick={() => setSignupOpen(true)}
                      className="text-gray-900 dark:text-white font-medium hover:underline"
                    >
                      Sign Up
                    </button>
                  </p>
                </form>
              </Form>
            )}
          </CardContent>
        </Card>
      </div>

      {!ssoEnabled && (
        <SignupDialog
          open={signupOpen}
          onClose={() => setSignupOpen(false)}
          onRegister={register}
          onSuccess={() => { setSignupOpen(false); router.push("/"); }}
        />
      )}
    </>
  );
}

function SignupDialog({
  open,
  onClose,
  onRegister,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onRegister: (name: string, email: string, password: string, confirmPassword: string) => Promise<{ success: boolean; error?: string }>;
  onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setName(""); setEmail(""); setPassword(""); setConfirmPassword(""); setError("");
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (name.trim().length < 2) { setError("Name must be at least 2 characters."); return; }
    if (!email.includes("@")) { setError("Please enter a valid email address."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }

    setLoading(true);
    try {
      const result = await onRegister(name.trim(), email.trim(), password, confirmPassword);
      if (result.success) {
        reset();
        onSuccess();
      } else {
        setError(result.error || "Registration failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create an account</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" required />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Email</label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@example.com" autoComplete="email" spellCheck={false} required />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Password</label>
            <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Min. 8 characters" autoComplete="new-password" required />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Confirm Password</label>
            <Input value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} type="password" placeholder="Re-enter your password" autoComplete="new-password" required />
          </div>

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={handleClose} disabled={loading}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="flex-1 bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-70 dark:bg-slate-100 dark:text-gray-900 dark:hover:bg-white"
            >
              {loading ? "Creating…" : "Sign Up"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
