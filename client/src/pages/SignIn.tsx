import { useState } from "react";
import { TRPCClientError } from "@trpc/client";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { getLoginUrl, isSafeSiteReturnPath, type LoginProvider } from "@/const";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSeo } from "@/hooks/useSeo";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Spinner } from "@/components/ui/spinner";
import { Eye, EyeOff } from "lucide-react";

function errMessage(error: unknown, fallback: string): string {
  if (error instanceof TRPCClientError) return error.message || fallback;
  if (error instanceof Error) return error.message || fallback;
  return fallback;
}

/** Brand glyphs for the social sign-in buttons (inline SVG, no extra deps). */
function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path fill="#4285F4" d="M23.52 12.27c0-.82-.07-1.6-.21-2.36H12v4.47h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.73z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.08 7.94-2.91l-3.88-3c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.29v3.09A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.29 14.29A7.2 7.2 0 0 1 4.91 12c0-.8.14-1.57.38-2.29V6.62H1.29A12 12 0 0 0 0 12c0 1.94.46 3.77 1.29 5.38l4-3.09z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.43-3.43C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.62l4 3.09C6.23 6.86 8.88 4.75 12 4.75z" />
    </svg>
  );
}

function AppleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="currentColor">
      <path d="M16.36 12.94c-.02-2.18 1.78-3.23 1.86-3.28-1.02-1.49-2.6-1.69-3.16-1.71-1.34-.14-2.62.79-3.3.79-.68 0-1.73-.77-2.85-.75-1.46.02-2.82.85-3.57 2.16-1.53 2.65-.39 6.56 1.09 8.71.73 1.05 1.59 2.23 2.73 2.19 1.1-.04 1.51-.71 2.84-.71 1.32 0 1.69.71 2.85.69 1.18-.02 1.93-1.07 2.65-2.13.84-1.22 1.18-2.4 1.2-2.46-.03-.01-2.3-.88-2.32-3.49zM14.2 6.36c.6-.73 1.01-1.74.9-2.75-.87.04-1.93.58-2.55 1.31-.56.65-1.05 1.69-.92 2.68.97.08 1.96-.5 2.57-1.24z" />
    </svg>
  );
}

function MicrosoftGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path fill="#F25022" d="M1 1h10v10H1z" />
      <path fill="#7FBA00" d="M13 1h10v10H13z" />
      <path fill="#00A4EF" d="M1 13h10v10H1z" />
      <path fill="#FFB900" d="M13 13h10v10H13z" />
    </svg>
  );
}

function SocialButton({
  provider,
  label,
  children,
}: {
  provider: LoginProvider;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a href={getLoginUrl(provider)} className="block">
      <Button
        type="button"
        variant="outline"
        className="w-full bg-background gap-2 font-medium"
      >
        {children}
        {label}
      </Button>
    </a>
  );
}

export default function SignIn() {
  const utils = trpc.useUtils();
  const { t, lang } = useLanguage();
  useSeo({ title: t("seo_signin_t"), description: t("seo_signin_d"), lang });

  // Login state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPw, setShowLoginPw] = useState(false);
  const [showResetRequest, setShowResetRequest] = useState(false);
  const [resetEmail, setResetEmail] = useState("");

  // Signup state
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showSignupPw, setShowSignupPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  const afterAuth = async () => {
    await utils.auth.me.invalidate();
    toast.success("Signed in successfully.");
    // Fetch fresh user to determine a safe same-host destination. A full
    // document navigation deliberately remounts the shared header so it reads
    // the newly-issued host-only session cookie instead of retaining a prior
    // anonymous auth.me query while entering the Designer.
    const me = await utils.auth.me.fetch();
    const requestedReturn = new URLSearchParams(window.location.search).get("returnTo");
    const destination = isSafeSiteReturnPath(requestedReturn)
      ? requestedReturn
      : me && (me as { role?: string }).role === "distributor"
        ? "/vendor"
        : me && (me as { role?: string }).role === "admin"
          ? "/admin"
          : "/account";
    window.location.assign(destination);
  };

  const loginMutation = trpc.emailAuth.login.useMutation({
    onSuccess: afterAuth,
    onError: (e) => toast.error(errMessage(e, "Unable to sign in.")),
  });

  const signupMutation = trpc.emailAuth.signup.useMutation({
    onSuccess: afterAuth,
    onError: (e) => toast.error(errMessage(e, "Unable to create account.")),
  });

  const resetMutation = trpc.emailAuth.requestPasswordReset.useMutation({
    onSuccess: () => toast.success("If that email is registered, a reset link is on its way."),
    onError: (e) => toast.error(errMessage(e, "Unable to request a password reset.")),
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) {
      toast.error("Enter your email and password.");
      return;
    }
    loginMutation.mutate({ email: loginEmail, password: loginPassword });
  };

  const handleSignup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!signupEmail || !signupPassword) {
      toast.error("Email and password are required.");
      return;
    }
    if (signupPassword.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (signupPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    signupMutation.mutate({
      email: signupEmail,
      password: signupPassword,
      name: name || undefined,
      companyName: companyName || undefined,
    });
  };

  const handleResetRequest = (e: React.FormEvent) => {
    e.preventDefault();
    const email = resetEmail.trim() || loginEmail.trim();
    if (!email) {
      toast.error("Enter the account email first.");
      return;
    }
    resetMutation.mutate({ email });
  };

  return (
    <div className="container max-w-md py-12">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Welcome to Cabinet Dealz</CardTitle>
          <CardDescription>
            Sign in to manage orders, pricing, and designs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Create Account</TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="mt-6">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <div className="relative">
                    <Input
                      id="login-password"
                      type={showLoginPw ? "text" : "password"}
                      autoComplete="current-password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••••"
                      className="pr-20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPw((v) => !v)}
                      className="absolute right-3 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={showLoginPw ? "Hide password" : "Show password"}
                    >
                      {showLoginPw ? <><EyeOff className="h-4 w-4" />Hide</> : <><Eye className="h-4 w-4" />Show</>}
                    </button>
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={loginMutation.isPending}
                >
                  {loginMutation.isPending ? (
                    <Spinner className="h-4 w-4" />
                  ) : (
                    "Sign In"
                  )}
                </Button>
              </form>
              <div className="mt-3 text-center">
                <button
                  type="button"
                  className="text-sm font-medium text-primary underline underline-offset-4 hover:text-primary/80"
                  onClick={() => {
                    setResetEmail(loginEmail);
                    setShowResetRequest((value) => !value);
                  }}
                >
                  Forgot password?
                </button>
              </div>
              {showResetRequest && (
                <form onSubmit={handleResetRequest} className="mt-4 space-y-3 rounded-md border bg-muted/30 p-3 text-left">
                  <div>
                    <Label htmlFor="password-reset-email">Account email</Label>
                    <Input
                      id="password-reset-email"
                      type="email"
                      autoComplete="email"
                      value={resetEmail}
                      onChange={(event) => setResetEmail(event.target.value)}
                      placeholder="you@example.com"
                      className="mt-1"
                      required
                    />
                  </div>
                  <Button type="submit" variant="outline" className="w-full" disabled={resetMutation.isPending}>
                    {resetMutation.isPending ? "Sending reset link…" : "Email password-reset link"}
                  </Button>
                </form>
              )}
            </TabsContent>

            <TabsContent value="signup" className="mt-6">
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Name</Label>
                  <Input
                    id="signup-name"
                    type="text"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-company">
                    Company <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    id="signup-company"
                    type="text"
                    autoComplete="organization"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Company name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    autoComplete="email"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <div className="relative">
                    <Input
                      id="signup-password"
                      type={showSignupPw ? "text" : "password"}
                      autoComplete="new-password"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignupPw((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={showSignupPw ? "Hide password" : "Show password"}
                    >
                      {showSignupPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-confirm">Confirm password</Label>
                  <div className="relative">
                    <Input
                      id="signup-confirm"
                      type={showConfirmPw ? "text" : "password"}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPw((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={showConfirmPw ? "Hide password" : "Show password"}
                    >
                      {showConfirmPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={signupMutation.isPending}
                >
                  {signupMutation.isPending ? (
                    <Spinner className="h-4 w-4" />
                  ) : (
                    "Create Account"
                  )}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              optional connected account
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="space-y-2">
            <SocialButton provider="google" label="Continue with Google">
              <GoogleGlyph />
            </SocialButton>
            <SocialButton provider="apple" label="Continue with Apple">
              <AppleGlyph />
            </SocialButton>
            <SocialButton provider="microsoft" label="Continue with Microsoft">
              <MicrosoftGlyph />
            </SocialButton>
          </div>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            Email and password sign-in stays on CabinetDealz. Connected-account buttons are optional.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
