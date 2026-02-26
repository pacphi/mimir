import {
  createRootRouteWithContext,
  Outlet,
  redirect,
  useLocation,
  isRedirect,
} from "@tanstack/react-router";
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

const DEV_USER: AuthUser = {
  id: "user_admin_01",
  email: "admin@sindri.dev",
  name: "Dev Admin",
  role: "ADMIN",
} as AuthUser;

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async ({ location }) => {
    // Check if auth bypass is enabled (dev mode)
    try {
      const configRes = await fetch("/api/config");
      if (configRes.ok) {
        const config = await configRes.json();
        if (config.authBypass) {
          // Skip all auth checks — auto-authenticate as dev admin
          if (isPublicPath(location.pathname)) {
            throw redirect({ to: "/dashboard", replace: true });
          }
          return { user: DEV_USER };
        }
      }
    } catch (err) {
      // Re-throw TanStack Router redirects — they use throw for control flow
      if (isRedirect(err)) throw err;
      // Config check failed — fall through to normal auth
    }

    // Normal auth flow
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
      // Session check failed
    }

    throw redirect({ to: "/login", replace: true });
  },
  component: RootComponent,
});

function RootComponent() {
  const { pathname } = useLocation();

  if (isPublicPath(pathname)) {
    return <Outlet />;
  }

  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}
