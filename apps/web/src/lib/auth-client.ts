import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: "/api/auth",
  plugins: [magicLinkClient()],
});

export const { useSession, signIn, signOut, signUp } = authClient;
