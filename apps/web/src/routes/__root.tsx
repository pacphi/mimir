import { createRootRouteWithContext, Outlet, redirect } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import type { AuthUser } from "@/stores/authStore";

interface RouterContext {
  queryClient: QueryClient;
  user?: AuthUser | null;
}

const PUBLIC_PATHS = ["/login", "/auth/magic-link-sent", "/auth/verify"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async ({ location }) => {
    if (isPublicPath(location.pathname)) {
      return;
    }

    try {
      const response = await fetch("/api/auth/get-session", {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        if (data?.session && data?.user) {
          return { user: data.user as AuthUser };
        }
      }
    } catch {
      // Session check failed — redirect to login
    }

    throw redirect({ to: "/login" });
  },
  component: RootComponent,
});

function RootComponent() {
  const pathname = Route.useMatch({ select: (m) => m.pathname });

  if (isPublicPath(pathname)) {
    return <Outlet />;
  }

  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}
