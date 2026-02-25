import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

interface SearchParams {
  token?: string;
}

export const Route = createFileRoute("/auth/verify")({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  component: VerifyPage,
});

function VerifyPage() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"validating" | "ready" | "signing-in" | "error">(
    "validating",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMessage("No token provided. Please request a new magic link.");
      return;
    }
    setStatus("ready");
  }, [token]);

  async function handleSignIn() {
    if (!token) return;
    setStatus("signing-in");

    try {
      const response = await fetch(
        `/api/auth/magic-link/verify?token=${encodeURIComponent(token)}`,
        {
          method: "GET",
          credentials: "include",
        },
      );

      if (response.ok) {
        navigate({ to: "/dashboard" });
      } else {
        setStatus("error");
        setErrorMessage("This link has expired or already been used. Please request a new one.");
      }
    } catch {
      setStatus("error");
      setErrorMessage("Failed to verify. Please try again or request a new magic link.");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-center">
          <div className="rounded-full bg-primary/10 p-4">
            {status === "error" ? (
              <XCircle className="h-8 w-8 text-destructive" />
            ) : status === "validating" || status === "signing-in" ? (
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            ) : (
              <CheckCircle className="h-8 w-8 text-primary" />
            )}
          </div>
        </div>

        <div className="rounded-lg border bg-card p-6 shadow-sm space-y-4 text-center">
          {status === "validating" && (
            <>
              <h2 className="text-xl font-semibold">Validating...</h2>
              <p className="text-sm text-muted-foreground">Checking your magic link.</p>
            </>
          )}

          {status === "ready" && (
            <>
              <h2 className="text-xl font-semibold">Ready to sign in</h2>
              <p className="text-sm text-muted-foreground">
                Click the button below to complete sign-in.
              </p>
              <Button className="w-full" onClick={handleSignIn}>
                Sign in to Mimir
              </Button>
            </>
          )}

          {status === "signing-in" && (
            <>
              <h2 className="text-xl font-semibold">Signing in...</h2>
              <p className="text-sm text-muted-foreground">Please wait while we sign you in.</p>
            </>
          )}

          {status === "error" && (
            <>
              <h2 className="text-xl font-semibold">Unable to sign in</h2>
              <p className="text-sm text-muted-foreground">{errorMessage}</p>
              <Button variant="outline" onClick={() => navigate({ to: "/login" })}>
                Back to login
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
