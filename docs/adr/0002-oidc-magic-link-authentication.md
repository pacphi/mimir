# ADR 0002: OIDC and Magic Link Authentication via Better Auth

**Date:** 2026-02-24
**Status:** Accepted

---

## Context

Mimir needed a production-ready authentication layer that could support:

1. Social login (GitHub, Google) via OIDC/OAuth2
2. Passwordless email login (magic links)
3. API key authentication for CLI and CI/CD pipelines
4. Session management with HTTP-only cookies
5. A development bypass mode to skip auth during local development

The initial prototype used bare-metal implementations built on top of **Arctic** (OAuth2 helpers) and **OsloJS** (crypto/token utilities). While functional, this approach required significant hand-rolled code for session management, token rotation, PKCE flows, and account linking — all of which are solved problems.

---

## Decision

Replace the Arctic+OsloJS implementation with **Better Auth** (`better-auth` npm package).

Better Auth is a TypeScript-first authentication library that provides:

- Built-in OAuth2/OIDC providers (GitHub, Google, and others)
- Magic link / OTP email flows
- Session management with configurable cookie settings
- Prisma adapter for persisting sessions, accounts, and verification tokens
- A typed client SDK (`better-auth/client`) for the frontend

### Three Login Methods

| Method       | Endpoint                         | Description                                     |
| ------------ | -------------------------------- | ----------------------------------------------- |
| GitHub OAuth | `GET /api/auth/github`           | Redirects to GitHub OIDC flow                   |
| Google OAuth | `GET /api/auth/google`           | Redirects to Google OIDC flow                   |
| Magic Link   | `POST /api/auth/magic-link/send` | Sends a one-time login link to the user's email |

Magic links expire after 15 minutes. After clicking the link, the user is redirected to `/auth/verify?token=...` which exchanges the token for a session.

### Session Management

- Sessions are stored in the `Session` table (managed by Better Auth's Prisma adapter).
- The active session is identified by an HTTP-only `mimir_session` cookie.
- Session lifetime: 7 days (sliding window — refreshed on each request).
- `GET /api/auth/get-session` returns the current session and user object, used by the frontend's `beforeLoad` guard in `__root.tsx`.

### Dual-Mode Middleware

The API uses a `sessionMiddleware` that resolves the caller's identity from two sources:

1. **Cookie-based session** — for browser clients (resolved via `auth.api.getSession`)
2. **API key** — for CLI/programmatic clients (`Authorization: Bearer <key>` header). The key is looked up in the `ApiKey` table and the associated user is loaded.

Both paths set `c.var.user` so downstream middleware and route handlers have a uniform interface.

### Development Bypass

When `BETTER_AUTH_DEV_BYPASS=true` is set in the environment, the `sessionMiddleware` skips authentication and injects a synthetic admin user. This allows running the API locally without a configured OAuth app or email provider.

### Database Changes

Better Auth requires the following tables (added to the Prisma schema):

- `Session` — active sessions with expiry and cookie metadata
- `Account` — linked OAuth accounts per user (supports multiple providers per user)
- `Verification` — magic link and OTP tokens with expiry

The existing `User` model was extended with:

- `email_verified: Boolean`
- `image: String?`
- `banned: Boolean`
- `ban_reason: String?`
- `ban_expires: DateTime?`

---

## Consequences

**Positive:**

- Eliminates ~400 lines of hand-rolled auth code.
- Adds account linking (same email via different providers merges into one user).
- Magic link flow works out of the box with any SMTP provider.
- The typed client SDK (`useSession`, `signOut`, `signIn.social`) integrates cleanly with React.
- Better Auth handles PKCE, state parameters, and token refresh internally.

**Negative:**

- Better Auth is a relatively new library (< 2 years old); long-term maintenance is not guaranteed.
- The Prisma adapter requires keeping Better Auth's expected schema in sync with Prisma migrations.
- Magic link delivery depends on a configured SMTP service; local development requires either the dev bypass or a local mail server (e.g. Mailpit).

**Neutral:**

- Arctic and OsloJS dependencies were removed entirely.
- The `@/lib/auth-client` module wraps Better Auth's client and re-exports `useSession`, `signOut`, and `signIn` for use throughout the frontend.
