import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Mail, ArrowLeft, Loader2 } from "lucide-react";

interface SearchParams {
  email?: string;
}

export const Route = createFileRoute("/auth/magic-link-sent")({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    email: typeof search.email === "string" ? search.email : undefined,
  }),
  component: MagicLinkSentPage,
});

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}***@${domain}`;
}

function MagicLinkSentPage() {
  const { email } = Route.useSearch();
  const [isResending, setIsResending] = useState(false);
  const [resent, setResent] = useState(false);

  async function handleResend() {
    if (!email || isResending) return;
    setIsResending(true);
    try {
      await authClient.signIn.magicLink({
        email,
        callbackURL: "/dashboard",
      });
      setResent(true);
    } catch {
      // Silently fail — don't reveal if email exists
    } finally {
      setIsResending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-center">
          <div className="rounded-full bg-primary/10 p-4">
            <Mail className="h-8 w-8 text-primary" />
          </div>
        </div>

        <div className="rounded-lg border bg-card p-6 shadow-sm space-y-4 text-center">
          <h2 className="text-xl font-semibold">Check your email</h2>

          <p className="text-sm text-muted-foreground">
            We sent a sign-in link to{" "}
            <span className="font-medium text-foreground">
              {email ? maskEmail(email) : "your email"}
            </span>
          </p>

          <p className="text-sm text-muted-foreground">
            Click the link in the email to access Mimir. It expires in 15 minutes.
          </p>

          <div className="pt-2">
            <p className="text-xs text-muted-foreground mb-2">Didn't receive it? Check spam or</p>
            {resent ? (
              <p className="text-xs text-primary font-medium">Link resent!</p>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResend}
                disabled={isResending || !email}
              >
                {isResending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Resend link
              </Button>
            )}
          </div>
        </div>

        <div className="text-center">
          <Link
            to="/login"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}
