import type { AuthConfig } from "convex/server";

// Clerk issues the JWT; Convex verifies it against this issuer.
// Set CLERK_JWT_ISSUER_DOMAIN in the Convex dashboard (Settings → Environment Variables),
// e.g. https://your-app.clerk.accounts.dev
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
