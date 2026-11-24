# Deploying a live demo (Vercel + Convex + Clerk development instance)

This is a free-tier demo setup. It runs without n8n: request events are recorded as “Notification not sent: automation isn’t configured on this deployment”, and the workflows are shown through the exported JSON and the local Docker setup in the README.

## Why a Clerk *development* instance
Clerk production instances need a domain you own; Clerk doesn’t support `*.vercel.app` for production. A development instance works on any URL, shows a small “Development mode” badge, and supports test sign-ins (`name+clerk_test@example.com` with code `424242`). That makes it a good fit for a reviewer demo. Its limits (100 users, capped real emails) don’t matter here.

## 1. Convex production deployment
1. In the Convex dashboard, open the project and switch to **Production**.
2. Set the production environment variables **before the first deploy**. `auth.config.ts` reads `CLERK_JWT_ISSUER_DOMAIN`, so a deploy without it fails.

   | Variable | Value |
   | --- | --- |
   | `CLERK_JWT_ISSUER_DOMAIN` | the dev instance’s Frontend API URL, e.g. `https://verb-noun-00.clerk.accounts.dev` |
   | `LENDLOOP_ALLOW_SEED` | `true` only while seeding demo data, then delete it |
   | `N8N_REQUEST_WEBHOOK_URL`, `LENDLOOP_TO_N8N_SECRET`, `N8N_TO_LENDLOOP_SECRET` | **leave unset** for the demo (the app degrades gracefully; the n8n HTTP endpoints return 503) |

3. **Settings → General → Generate Production Deploy Key**, with the `deployment:deploy` permission. Copy it; it goes only into Vercel.

## 2. Vercel project
1. Import `PrinceGOdsplan/lendloop` at https://vercel.com/new (Framework: Next.js, root `./`).
2. **Build command:**
   ```
   npx convex deploy --cmd 'npm run build' --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL
   ```
   This pushes the Convex functions and schema to production, then builds Next.js with `NEXT_PUBLIC_CONVEX_URL` pointing at the production deployment.
3. **Environment variables:**

   | Variable | Environments | Value |
   | --- | --- | --- |
   | `CONVEX_DEPLOY_KEY` | Production only | production deploy key from step 1.3 |
   | `NEXT_PUBLIC_CONVEX_URL` | Production | `https://<prod-deployment>.convex.cloud`. Also set explicitly so server-side rendering of the public list has it at runtime. |
   | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Production | dev instance `pk_test_…` |
   | `CLERK_SECRET_KEY` | Production | dev instance `sk_test_…` |
   | `NEXT_PUBLIC_CLERK_TELEMETRY_DISABLED` | Production (optional) | `1` |

4. Deploy, then open `https://<project>.vercel.app`.

## 3. Clerk
- Convex integration activated, plus the `name` and `email` session claims (see the README).
- Test mode is on by default in development instances. Leave it on if reviewers should use `+clerk_test` demo accounts.

## 4. Demo data and an admin
```bash
export CONVEX_DEPLOY_KEY=…            # the production key, in your shell only
npx convex run seed:demo               # needs LENDLOOP_ALLOW_SEED=true on production
# sign in once on the live site as the demo admin, then:
npx convex run users:setRole '{"email":"demo-admin+clerk_test@example.com","role":"admin"}'
# after both test accounts have signed in once: one pending request for each,
# an active loan, an overdue loan and a returned loan (idempotent, no notifications)
npx convex run seed:reviewerScenario
npx convex env remove LENDLOOP_ALLOW_SEED
```

## 5. Checks after deploying
- `/?demo` shows the reviewer panel with both test logins. Plain `/` shows “How it works” instead, so the admin login isn't advertised.
- `/` loads signed out and lists the seeded tools, with name and category only.
- Sign in, list a tool, request it from a second account, and approve it. The loan shows “ⓘ Notification not sent: automation isn’t configured on this deployment”.
- `curl -i https://<prod>.convex.site/n8n/overdue-loans` returns `503` (no secret configured), not data.

## Optional: live n8n
No n8n option is both free and always on. You can run the repo’s `docker-compose.yml` on a VPS you already have (behind Caddy/TLS), or use an n8n Cloud trial (it expires). Then set the three n8n variables on Convex production, and `LENDLOOP_CONVEX_SITE_URL=https://<prod>.convex.site` in `n8n/.env`.
