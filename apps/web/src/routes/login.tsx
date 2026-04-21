import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { signIn } from "@/lib/auth-client";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Loader2 } from "lucide-react";

const DASHBOARD_URL = `${window.location.origin}/dashboard`;

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [isLoadingGithub, setIsLoadingGithub] = useState(false);
  const [isLoadingGoogle, setIsLoadingGoogle] = useState(false);
  const [isLoadingMagicLink, setIsLoadingMagicLink] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGitHub() {
    setError(null);
    setIsLoadingGithub(true);
    try {
      await signIn.social({
        provider: "github",
        callbackURL: DASHBOARD_URL,
      });
    } catch {
      setError("Failed to initiate GitHub sign-in. Please try again.");
      setIsLoadingGithub(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    setIsLoadingGoogle(true);
    try {
      await signIn.social({
        provider: "google",
        callbackURL: DASHBOARD_URL,
      });
    } catch {
      setError("Failed to initiate Google sign-in. Please try again.");
      setIsLoadingGoogle(false);
    }
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setError(null);
    setIsLoadingMagicLink(true);
    try {
      await authClient.signIn.magicLink({
        email: email.trim(),
        callbackURL: DASHBOARD_URL,
      });
      navigate({ to: "/auth/magic-link-sent", search: { email: email.trim() } });
    } catch {
      setError("Failed to send magic link. Please try again.");
      setIsLoadingMagicLink(false);
    }
  }

  const isLoading = isLoadingGithub || isLoadingGoogle || isLoadingMagicLink;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Mimir</h1>
          <p className="text-sm text-muted-foreground">Fleet Management Control Plane</p>
        </div>

        <div className="rounded-lg border bg-card p-6 shadow-sm space-y-6">
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-3">
            <Button
              variant="outline"
              className="w-full justify-center gap-2"
              onClick={handleGitHub}
              disabled={isLoading}
            >
              {isLoadingGithub ? <Loader2 className="h-4 w-4 animate-spin" /> : <GithubIcon />}
              Continue with GitHub
            </Button>

            <Button
              variant="outline"
              className="w-full justify-center gap-2"
              onClick={handleGoogle}
              disabled={isLoading}
            >
              {isLoadingGoogle ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />}
              Continue with Google
            </Button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">or</span>
            </div>
          </div>

          <form onSubmit={handleMagicLink} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full justify-center gap-2"
              disabled={isLoading || !email.trim()}
            >
              {isLoadingMagicLink ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              Send magic link
            </Button>
          </form>

          <p className="text-xs text-center text-muted-foreground">
            No password needed — we'll email you a secure sign-in link.
          </p>
        </div>

        <p className="text-xs text-center text-muted-foreground">
          Don't have access? Contact your organization's admin.
        </p>
      </div>
    </div>
  );
}

function GithubIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}
