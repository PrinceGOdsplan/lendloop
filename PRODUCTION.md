# Running LendLoop in production: what I would change

This take-home is built to be correct and easy to review, not to carry real users. This note lists the gaps I know about, roughly in priority order.

## 1. Secrets and the integration boundary
- **Rotate secrets without downtime.** Today each direction has one HMAC secret. I would accept two at once (`*_SECRET` and `*_SECRET_NEXT`), sign with the new one, verify against both, then retire the old one. Secrets would live in a manager (AWS Secrets Manager, Doppler or 1Password) and be injected into Convex, the host and n8n, not copied between `.env` files.
- **Tighter replay protection.** The ±5 minute window plus idempotent write-backs makes a replayed write-back harmless, but a replayed `GET /n8n/overdue-loans` inside the window would still return data. I would add a nonce header stored with a short TTL and rejected on reuse. I would also put n8n → Convex traffic behind an IP allow-list or mTLS through a gateway.
- **Credential type in n8n.** Secrets are read as `$env.*`, which means turning on `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` for the whole instance. On a shared n8n I would move signing into a small custom node or credential type so other workflows can’t read the variables, or run LendLoop’s automation on its own n8n instance.

## 2. Reliability of delivery
- **Real channels.** Replace the mock Code nodes with an Email (SES, Resend or SMTP) or Slack node, using n8n credentials, and record the provider’s message id in `automationEvents`.
- **Exactly-once reminders.** Delivery is at least once today: if the reminder goes out and the write-back fails for good, the next run can remind again. I would add a claim step (`POST /n8n/events` with `status: "sending"` before sending, `"sent"` after) or pass the dedupe key to an email provider that supports idempotency keys.
- **Queue, don’t fire and forget.** Convex scheduled actions plus backoff work, but a durable outbox table with a dashboard of stuck or failed deliveries, a “retry now” admin action, and alerting on age would be easier to operate. The Convex Workpool or Workflow components fit this well.
- **Don’t treat one VPS as the long-term home for automation.** Run n8n in queue mode (main + workers + Redis + Postgres instead of SQLite) on managed infrastructure such as ECS/Fargate with RDS, or use n8n Cloud. Put it behind a TLS reverse proxy, with backups of the n8n database and `N8N_ENCRYPTION_KEY`.

## 3. Observability
- Error workflow → real alerts (Slack or PagerDuty), not just a log line.
- Ship Convex logs (log streams) and n8n logs to Datadog or a similar tool, with dashboards for webhook success rate, retry counts, overdue backlog and HMAC rejections, plus an alert on a sudden rise in rejections, which suggests a misconfigured or attacked endpoint.
- Sentry on the Next.js app.
- A health check that alerts if the daily overdue run didn’t happen (a dead-man’s switch).

## 4. Privacy, data and compliance
- **Retention:** prune `automationEvents` and n8n executions on a schedule (n8n is already set to 7 days in `docker-compose.yml`), and redact recipient emails from n8n execution data.
- **Account deletion:** handle Clerk `user.deleted` webhooks (verified with Svix) to anonymise the `users` row and remove the email while keeping loan history consistent.
- **Admin audit trail:** record who removed a listing or changed Trusted Lender, and when. `removedBy` is only a first step.
- **Backups:** scheduled Convex exports to encrypted object storage (S3), with a tested restore.

## 5. Product and correctness
- **Time zones:** dates are UTC calendar days. For a real neighbourhood I would store each user’s time zone, judge “overdue” in the borrower’s local day, and send reminders at a sensible local hour.
- **Scale:** list queries use `take(200)` and per-tool lookups, which is fine for a neighbourhood. For more data I would add pagination (`usePaginatedQuery`) and denormalise “currently on loan” onto `tools`.
- **Abuse controls:** rate-limit request creation (Convex rate-limiter component), validate content, and let neighbours report listings to admins.
- **Roles:** move role assignment to Clerk Organizations or `publicMetadata`, synced by a verified webhook, so admins are managed in one place with an audit trail. Convex would still enforce the role.

## 6. Delivery pipeline
- GitHub Actions running `npm run verify` and `npm run build` on every PR, and regenerating `convex/_generated` against the dev deployment to catch drift. Preview deployments on Vercel with Convex preview deployments. `npx convex deploy` gated on main.
- Dependabot or Renovate, plus `npm audit` in CI, and pinned n8n image upgrades tested against the exported workflows.
- A stricter Content-Security-Policy, once the Clerk and Convex origins for production are known.
