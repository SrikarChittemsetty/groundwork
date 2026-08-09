# Values Mirror

A private tool that helps you check whether you're actually living consistently
with your own stated values — an honest mirror, not a judge. Log your core
values, log real decisions over time, and get an honest, non-judgmental
AI-assisted reflection on where they line up and where they don't.

## Design principles (non-negotiable)

- **Visibility, not verdicts.** The tool surfaces patterns and tensions as
  observations and questions. It never hands down "you're a hypocrite" or
  "you're consistent." You interpret your own trajectory.
- **No external judgment.** Nobody else sees your data unless you explicitly
  share it. This is not social media.
- **Sensitive data by default.** Values, beliefs, and decisions are encrypted at
  rest (AES-256-GCM, application layer), transmitted over HTTPS in production,
  and you can export or permanently delete everything at any time.

## Stack

- Next.js 14 (App Router) + React + TypeScript
- Prisma ORM — **SQLite in dev** (zero setup), one-line swap to Postgres
- Claude (Anthropic API) for the reflection feature, called from the backend
- Session auth via signed httpOnly JWT cookie; passwords hashed with bcrypt

## Getting started

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment**

   ```bash
   cp .env.example .env
   ```

   Then fill in `.env`:

   - `AUTH_SECRET` — `openssl rand -base64 48`
   - `APP_ENCRYPTION_KEY` — `openssl rand -hex 32` (exactly 64 hex chars)
   - `ANTHROPIC_API_KEY` — from https://console.anthropic.com/ (needed only for
     the Reflect feature; the rest of the app works without it)

3. **Create the database**

   ```bash
   npm run db:push
   ```

4. **Run**

   ```bash
   npm run dev
   ```

   Open http://localhost:3000, create an account, and start adding values.

## What's here (v0.1 MVP scope)

- Email/password auth (multi-user capable; fine to use solo), with password
  change and brute-force throttling on sign-in
- Decisions can be tagged with **which values they bear on** — your judgment,
  not the tool's — which is fed to the AI features so tension is grounded in
  what you said the decision was about
- Values entry (encrypted), with inline editing and **full wording history** —
  editing a value never overwrites what you used to believe; the timeline
  distinguishes "Value stated" from "Value revised"
- Decision/action log with timestamps (encrypted), with inline editing
- AI reflection over your values + decisions (Claude) — observations and
  questions, never verdicts. Can be scoped to a single value or a recent
  window; when scoped, the prompt is told so, since a filtered gap isn't the
  same as a gap in your life
- Timeline filtering (everything / values only / decisions only) — the counts
  always describe the whole record, so narrowing the view never looks like
  history shrinking
- "What should I do?" decision aid (`/ask`) — practical-syllogism-style
  guidance that lays out how your own values bear on a new situation and what
  your history suggests; paths and costs, never a recommendation
- A merged chronological timeline of values (every wording) and decisions
- Full data export (JSON, including value history) and permanent account
  deletion
- A per-user AI cost guard (hourly/daily caps shared across Reflect and Ask,
  configurable via `AI_LIMIT_PER_HOUR` / `AI_LIMIT_PER_DAY`)
- An honest `/privacy` page describing actual behavior — including that the AI
  features send your entries to Anthropic's API, and that this is not
  end-to-end encrypted

## Dev conveniences (hard-gated to non-production)

- `DEV_AUTOLOGIN="true"` in `.env` skips the login screen and auto-signs-in a
  seeded `dev@local` user.
- With no `ANTHROPIC_API_KEY` set, the AI endpoints return clearly-labeled
  mock output so the full loop is demoable. In production a missing key fails
  loudly instead.

## Tests

```bash
npm test
```

Covers the things that would be quietly catastrophic if they broke:

- **Encryption** — round-trip, random IV, tamper/auth-tag rejection, and that
  plaintext never appears in the stored value
- **Markdown rendering** — model output is injected with
  `dangerouslySetInnerHTML`, so HTML/script escaping is a security boundary
- **Prompt guardrails** — asserts the "visibility, not verdicts" rules are
  actually present in both system prompts, so a future edit can't quietly turn
  the tool into a judge
- **Per-user scoping** — one user cannot read, edit, or delete another's data
  even with a valid row id, and account deletion cascades to every table

Tests run against a throwaway SQLite file, never your dev database.

## Moving to Postgres

In `prisma/schema.prisma`, change:

```prisma
datasource db {
  provider = "postgresql"   // was "sqlite"
  url      = env("DATABASE_URL")
}
```

Point `DATABASE_URL` at your Postgres instance and run `npm run db:push`. No
model changes required.

This has been verified against a real Postgres 16 instance, not just assumed:
schema push, seeding, versioned edits inside transactions, cascade deletes,
the AI request path, and encryption at rest all behaved identically to SQLite.

See [DEPLOYMENT.md](DEPLOYMENT.md) for the full deploy guide.

## Security notes

- `APP_ENCRYPTION_KEY` decrypts all stored personal data. Back it up securely;
  if you lose or rotate it, existing rows can no longer be decrypted.
- The SQLite `dev.db` file contains ciphertext but is still personal — it's
  gitignored. Don't commit it.
- Before any real launch: HTTPS everywhere, a real privacy policy, and (given
  values/beliefs may be GDPR "special category data") a brief legal review. See
  the build plan.

## Out of scope for v0.1 (deferred)

Team/multi-tenant version, vector/semantic search, native mobile app, richer
dissonance visualization, and BYOK API keys.
